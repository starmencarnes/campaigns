import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();

export const configFile = {
  runtime: 'nodejs18.x'
};

export default async function handler(req, res) {
  console.log('🔍 Incoming request:', req.method, req.headers['content-type'], req.body);

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Slack URL verification
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // Signature verification
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

  const event = req.body.event;

  // Only handle app_mention
  if (
    req.body.type === 'event_callback' &&
    event.type === 'app_mention' &&
    event.user !== req.body.authorizations?.[0]?.user_id &&
    !event.bot_id
  ) {
    const text = event.text.replace(/<@[^>]+>\s*/, '').trim(); // Strip @bot mention
    console.log('🤖 Received mention:', text);

    const reply = await getAssistantResponse(text);

    console.log('📨 Replying in Slack thread...');
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

    const slackData = await slackRes.json();
    console.log('✅ Slack response:', slackData);
  }

  res.status(200).send('OK');
}
