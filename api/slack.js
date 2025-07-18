// /api/slack.js
import crypto from 'crypto';
import { config } from 'dotenv';
import fetch from 'node-fetch';        // remove this line on Node.js 18+
import { getAssistantResponse } from '../lib/assistant.js';
import { get } from '@vercel/edge-config';

config();
export const configFile = { runtime: 'nodejs18.x' };

// in-memory dedupe for Slack retries
const seenEvents = new Set();

export default async function handler(req, res) {
  // 0) only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) URL verification handshake
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) skip Slack retries
  const retry = req.headers['x-slack-retry-num'];
  if (retry) {
    console.log('🛑 Slack retry, skipping:', retry);
    return res.status(200).end();
  }

  // 3) verify signature
  const sig     = req.headers['x-slack-signature'];
  const ts      = req.headers['x-slack-request-timestamp'];
  const bodyRaw = JSON.stringify(req.body);
  const expected =
    'v0=' +
    crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
      .update(`v0:${ts}:${bodyRaw}`)
      .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    console.error('❌ Signature mismatch', { expected, got: sig });
    return res.status(403).send('Invalid signature');
  }

  // 4) pull out & filter event
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return res.status(200).end();
  }

  // 5) de-dup by event_id (in-memory)
  const eid = req.body.event_id;
  if (seenEvents.has(eid)) {
    console.log('⚠️ Duplicate event, skipping:', eid);
    return res.status(200).end();
  }
  seenEvents.add(eid);
  console.log('✅ New event:', eid);

  // 6) figure out Slack → OpenAI thread mapping keys
  const channel = event.channel;
  const slackTs = event.thread_ts || event.ts;
  const mapKey  = `openAIThread:${slackTs}`;

  // 7) read any existing OpenAI thread ID from Edge Config
  const existingThread = await get(mapKey);

  // 8) extract the user’s text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', userText);

  // 9) immediate “I’m on it!” ping
  try {
    const ping = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        thread_ts: slackTs,
        text: "👋 I’m on it! Give me a sec…"
      })
    });
    console.log('ℹ️ Ping response:', await ping.json());
  } catch (err) {
    console.error('❌ Ping error:', err);
  }

  // 10) call your thread-aware assistant
  let aiReply, threadId;
  try {
    ({ reply: aiReply, threadId } = 
      await getAssistantResponse(userText, existingThread));
    console.log('✅ Assistant replied:', aiReply);

    // 11) if first turn, persist new threadId with a PATCH
    if (!existingThread && threadId) {
      const cfgId = process.env.EDGE_CONFIG_ID;
      const patchRes = await fetch(
        `https://api.vercel.com/v1/edge-config/${cfgId}/items`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            items: [
              { key: mapKey, value: threadId }
            ]
          })
        }
      );
      console.log(
        '🗄️ Persist mapping:', await patchRes.json()
      );
    }

  } catch (err) {
    console.error('❌ Assistant error:', err);
    aiReply = 'Sorry, something went wrong getting your idea.';
  }

  // 12) post the final AI reply
  try {
    const replyRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        thread_ts: slackTs,
        text: aiReply
      })
    });
    console.log('ℹ️ Reply response:', await replyRes.json());
  } catch (err) {
    console.error('❌ Reply error:', err);
  }

  // 13) finally ACK Slack
  return res.status(200).send('OK');
}
