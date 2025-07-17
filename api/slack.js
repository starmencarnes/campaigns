import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();

// Ensure this file runs on Node 18
export const configFile = {
  runtime: 'nodejs18.x'
};

// In‑memory store of processed events (per cold start)
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

  // 2) Skip Slack retry attempts entirely
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 3) Verify Slack request signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const bodyRaw = JSON.stringify(req.body);
  const expectedSig = 'v0=' +
    crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
          .update(`v0:${timestamp}:${bodyRaw}`)
          .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    console.error('❌ Signature mismatch');
    return res.status(403).send('Invalid signature');
  }

  // 4) Acknowledge immediately to prevent Slack retries
  res.status(200).end();

  // 5) Extract the event and ignore anything except app_mention by a user
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return;
  }

  // 6) De‑duplicate by event_id
  const eventId = req.body.event_id;
  if (processedEvents.has(eventId)) {
    console.log('⚠️ Duplicate event detected, skipping:', eventId);
    return;
  }
  console.log('✅ New event, processing:', eventId);
  processedEvents.add(eventId);

  // 7) Clean up the user’s text
  const text = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', text);

  // 8) Ask the assistant
  let reply;
  try {
    console.log('⏳ Calling getAssistantResponse with:', text);
    reply = await getAssistantResponse(text);
    console.log('✅ Assistant replied:', reply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = "Sorry, something went wrong getting your idea.";
  }

  // 9) Post the reply into the same thread
  try {
    console.log('📨 Posting reply to Slack thread:', event.thread_ts || event.ts);
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: reply
      })
    });
    const data = await slackRes.json();
    console.log('✅ Slack API response:', data);
  } catch (err) {
    console.error('❌ Error posting to Slack:', err);
  }
}
