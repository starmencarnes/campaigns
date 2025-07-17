import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from '../lib/assistant.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export default async function handler(req, res) {
  // 1) Skip any Slack retries to avoid duplicates
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 2) Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 3) URL verification handshake
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 4) Verify Slack signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);
  const sigBase = `v0:${timestamp}:${body}`;
  const mySig = 'v0='
    + crypto
        .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
        .update(sigBase)
        .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(signature))) {
    return res.status(403).send('Invalid signature');
  }

  // 5) Acknowledge immediately to prevent timeouts
  res.status(200).end();

  // 6) Only process “event_callback” with an app_mention
  if (req.body.type !== 'event_callback') return;
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) return;

  // 7) Strip mention and get Assistant response
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', userText);

  const reply = await getAssistantResponse(userText);
  console.log('✉️ Sending reply:', reply);

  // 8) Post back in thread
  try {
    const result = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: reply
    });
    console.log('✅ Slack API response:', result.ok);
  } catch (err) {
    console.error('❌ Slack postMessage error:', err);
  }
}
