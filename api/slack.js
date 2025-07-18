// /api/slack.js
import crypto from 'crypto';
import { config } from 'dotenv';
import fetch from 'node-fetch'; // or omit on Node18+
import { getAssistantResponse } from '../lib/assistant.js';
import { get, set } from '@vercel/edge-config';

config();
export const configFile = { runtime: 'nodejs18.x' };

// No in-memory map any more

export default async function handler(req, res) {
  // 0) Only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) Slack URL verification
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) Skip Slack retry attempts
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 3) Verify Slack signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const bodyRaw   = JSON.stringify(req.body);
  const expected  = 'v0=' +
    crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${bodyRaw}`)
      .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    console.error('❌ Signature mismatch', { expected, signature });
    return res.status(403).send('Invalid signature');
  }

  // 4) Pull out the event & ignore non-mentions/bots
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return res.status(200).end();
  }

  // 5) Deduplicate by event_id
  const eventId = req.body.event_id;
  const dedupeKey = `slackEvent:${eventId}`;
  const seen = await get(dedupeKey);
  if (seen) {
    console.log('⚠️ Duplicate event, skipping:', eventId);
    return res.status(200).end();
  }
  await set(dedupeKey, true);
  console.log('✅ New event, processing:', eventId);

  // 6) Compute Slack thread key & user text
  const channel   = event.channel;
  const slackTs   = event.thread_ts || event.ts;
  const mapKey    = `openAIThread:${slackTs}`;
  const existingThread = await get(mapKey);

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
    console.error('❌ Error sending ping:', err);
  }

  // 8) Call your thread-aware assistant
  let aiReply, openAIThreadId;
  try {
    ({ reply: aiReply, threadId: openAIThreadId } =
      await getAssistantResponse(userText, existingThread));
    console.log('✅ Assistant replied:', aiReply);

    // on first turn, persist the new threadId
    if (!existingThread && openAIThreadId) {
      await set(mapKey, openAIThreadId);
      console.log(`🗄️ Persisted mapping ${mapKey} → ${openAIThreadId}`);
    }
  } catch (err) {
    console.error('❌ Assistant error:', err);
    aiReply = 'Sorry, something went wrong getting your idea.';
  }

  // 9) Post the final answer
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
    console.error('❌ Error sending final reply:', err);
  }

  // 10) Finally ACK Slack
  return res.status(200).send('OK');
}
