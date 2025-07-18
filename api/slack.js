// /api/slack.js
import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();
export const configFile = { runtime: 'nodejs18.x' };

// In-memory de-dup store (resets on cold start)
const processedEvents = new Set();

export default async function handler(req, res) {
  // 0) Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) Slack URL verification handshake
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) Skip Slack retry attempts
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 3) Verify Slack request signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const bodyRaw   = JSON.stringify(req.body);
  const expectedSig = 'v0=' +
    crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${bodyRaw}`)
      .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    console.error('❌ Signature mismatch', { expectedSig, signature });
    return res.status(403).send('Invalid signature');
  }

  // 4) Pull out the event
  const event = req.body.event;
  if (!event) {
    return res.status(200).end();
  }

  // 5) Only handle app_mention or direct‐message (message.im) from users
  const isMention = event.type === 'app_mention';
  const isDM      = event.type === 'message' && event.channel_type === 'im';
  if ((!isMention && !isDM) || event.bot_id) {
    return res.status(200).end();
  }

  // 6) Deduplicate by event_id
  const eventId = req.body.event_id;
  if (processedEvents.has(eventId)) {
    console.log('⚠️ Duplicate event, skipping:', eventId);
    return res.status(200).end();
  }
  processedEvents.add(eventId);
  console.log('✅ New event, processing:', eventId);

  // 7) Compute thread context and extract user text
  const channel   = event.channel;
  const thread_ts = event.thread_ts || event.ts;
  let userText;
  if (isMention) {
    userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  } else {
    userText = event.text.trim();
  }
  console.log('🤖 User said:', userText);

  // 8) Immediate “I’m on it!” ping
  console.log('📨 Posting immediate acknowledgement…');
  try {
    const pingRes = await fetch(
      'https://slack.com/api/chat.postMessage',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          thread_ts,
          text: "👋 I’m on it! Give me a sec…"
        })
      }
    );
    const pingJson = await pingRes.json();
    console.log('ℹ️ Ping response:', pingJson);
  } catch (err) {
    console.error('❌ Error sending ping:', err);
  }

  // 9) Call your assistant
  console.log('⏳ Calling getAssistantResponse with:', userText);
  let aiReply;
  try {
    aiReply = await getAssistantResponse(userText);
    console.log('✅ Assistant replied:', aiReply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    aiReply = 'Sorry, something went wrong getting your idea.';
  }

  // 10) Post the final answer in the same thread
  console.log('📨 Posting final reply…');
  try {
    const replyRes = await fetch(
      'https://slack.com/api/chat.postMessage',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channel, thread_ts, text: aiReply })
      }
    );
    const replyJson = await replyRes.json();
    console.log('ℹ️ Reply response:', replyJson);
  } catch (err) {
    console.error('❌ Error sending final reply:', err);
  }

  // 11) Finally ACK Slack
  return res.status(200).send('OK');
}
