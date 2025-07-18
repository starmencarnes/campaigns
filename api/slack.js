import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();
export const configFile = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  // 0) Only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) URL verification
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) Skip Slack retry attempts
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 3) Verify Slack signature
  const sig  = req.headers['x-slack-signature'];
  const ts   = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);
  const mySig = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${ts}:${body}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig))) {
    console.error('❌ Signature mismatch', { expected: mySig, got: sig });
    return res.status(403).send('Invalid signature');
  }

  // 4) Extract event and ignore non‑mentions
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return res.status(200).end();
  }

  // 5) Process the mention
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', userText);

  // 6) Get the AI (stub or real)
  let reply;
  try {
    reply = await getAssistantResponse(userText);
    console.log('✅ Assistant replied:', reply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = 'Sorry, something went wrong getting your idea.';
  }

  // 7) Post back to Slack
  const payload = { channel: event.channel, thread_ts: event.thread_ts || event.ts, text: reply };
  console.log('📨 Posting to Slack with payload:', payload);

  let slackData;
  try {
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log('ℹ️ HTTP status:', slackRes.status);
    slackData = await slackRes.json();
    console.log('ℹ️ Slack response body:', slackData);
  } catch (err) {
    console.error('❌ Network error posting to Slack:', err);
  }

  // 8) Finally ACK Slack once we’ve done the work
  return res.status(200).send('OK');
}
