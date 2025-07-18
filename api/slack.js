import crypto from 'crypto';
import { config } from 'dotenv';
import fetch from 'node-fetch';    // or remove if using native fetch
import { getAssistantResponse } from '../lib/assistant.js';
import { get, set } from '@vercel/edge-config';

config();
export const configFile = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (req.body?.type === 'url_verification') return res.status(200).send(req.body.challenge);

  // 1) Skip Slack retries
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 2) Verify signature
  const sig      = req.headers['x-slack-signature'];
  const ts       = req.headers['x-slack-request-timestamp'];
  const bodyRaw  = JSON.stringify(req.body);
  const expected = 'v0=' +
    crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
          .update(`v0:${ts}:${bodyRaw}`)
          .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    console.error('❌ Signature mismatch', { expected, sig });
    return res.status(403).send('Invalid signature');
  }

  // 3) Pull out event & filter
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return res.status(200).end();
  }

  // 4) De-dup by event_id
  const eventId = req.body.event_id;
  const dedupeKey = `slackEvent:${eventId}`;
  if (await get(dedupeKey)) {
    console.log('⚠️ Duplicate event, skipping:', eventId);
    return res.status(200).end();
  }
  await set(dedupeKey, true);
  console.log('✅ New event:', eventId);

  // 5) Prepare thread mapping
  const channel = event.channel;
  const slackTs = event.thread_ts || event.ts;
  const mapKey  = `openAIThread:${slackTs}`;
  const existingThread = await get(mapKey);

  // 6) Extract user text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', userText);

  // 7) Immediate “I’m on it!” ping
  try {
    const pingRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channel, thread_ts: slackTs, text: "👋 I’m on it! Give me a sec…" })
    });
    console.log('ℹ️ Ping response:', await pingRes.json());
  } catch (err) {
    console.error('❌ Ping error:', err);
  }

  // 8) Call your thread-aware assistant
  let aiReply, openAIThreadId;
  try {
    ({ reply: aiReply, threadId: openAIThreadId } =
      await getAssistantResponse(userText, existingThread));
    console.log('✅ Assistant replied:', aiReply);

    // Persist threadId on first turn
    if (!existingThread && openAIThreadId) {
      await set(mapKey, openAIThreadId);
      console.log(`🗄️ Saved mapping ${mapKey}→${openAIThreadId}`);
    }
  } catch (err) {
    console.error('❌ Assistant error:', err);
    aiReply = 'Sorry, something went wrong getting your idea.';
  }

  // 9) Post final answer
  try {
    const replyRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channel, thread_ts: slackTs, text: aiReply })
    });
    console.log('ℹ️ Reply response:', await replyRes.json());
  } catch (err) {
    console.error('❌ Reply error:', err);
  }

  // 10) ACK Slack
  return res.status(200).send('OK');
}
