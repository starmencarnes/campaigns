import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();

// 🧠 In-memory store to deduplicate events (resets on cold start)
const processedEvents = new Set();

export const configFile = {
  runtime: 'nodejs18.x'
};

export default async function handler(req, res) {
  console.log('🔍 Incoming request:', req.method, req.headers['content-type'], req.body);

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // ✅ Handle Slack URL verification
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // ✅ Verify Slack signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);
  const sigBase = `v0:${timestamp}:${body}`;
  const mySig = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBase)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(signature))) {
    return res.status(403).send('Invalid signature');
  }

  // ✅ Acknowledge the event immediately to prevent retries
  res.status(200).send('OK');

  if (req.body?.type !== 'event_callback') return;

  const event = req.body.event;
  const eventId = req.body.event_id;

  // ✅ Avoid duplicate processing
  if (processedEvents.has(eventId)) {
    console.log(`⚠️ Duplicate event ignored: ${eventId}`);
    return;
  }
  processedEvents.add(eventId);

  // ✅ Process app_mention
  if (
    event &&
    event.type === 'app_mention' &&
    event.user !== req.body.authorizations?.[0]?.user_id &&
    !event.bot_id
  ) {
    const text = event.text.replace(/<@[^>]+>\s*/, '');
    console.log('🤖 Received mention:', text);

    try {
      const reply = await getAssistantResponse(text);
      console.log('✉️ Sending reply:', reply);

      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: event.channel,
          text: reply,
          thread_ts: event.thread_ts || event.ts
        })
      });

      const slackData = await slackRes.json();
      if (!slackData.ok) {
        console.error('❌ Slack API error:', slackData);
      }
    } catch (err) {
      console.error('❌ Error in OpenAI or Slack:', err);
    }
  }
}
