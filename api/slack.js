import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();

export const configFile = {
  runtime: 'nodejs18.x'
};

// ← Add an in‑memory Set at the top for dedupe
+ const processedEvents = new Set();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // ✅ Handle Slack URL verification (challenge request)
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // ✅ Verify Slack request signature
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

  // ✅ Handle app_mention events
  const event = req.body.event;
  if (event && event.type === 'app_mention') {
+   // ——— New De‑duplication Step ———
+   const eventId = req.body.event_id;
+   if (processedEvents.has(eventId)) {
+     console.log('⚠️ Duplicate event detected, skipping:', eventId);
+     return res.status(200).send('OK');    // ack & stop
+   }
+   console.log('✅ New event, processing:', eventId);
+   processedEvents.add(eventId);
+   // ——————————————————————————

    const text = event.text.replace(/<@[^>]+>\s*/, ''); // Remove @mention
    const reply = await getAssistantResponse(text);

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: event.channel,
        text: reply
      })
    });
  }

  // ✅ Final response to Slack (must return 200)
  res.status(200).send('OK');
}
