import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from '../lib/assistant.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export default async function handler(req, res) {
  // 1) Skip Slack retries
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 2) Only POST
  if (req.method !== 'POST') {
    console.log('⚠️ Non‐POST received:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  // 3) URL verification
  if (req.body?.type === 'url_verification') {
    console.log('🔑 URL verification challenge');
    return res.status(200).send(req.body.challenge);
  }

  // 4) Signature check
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const bodyRaw = JSON.stringify(req.body);
  const expectedSig = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${bodyRaw}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    console.error('❌ Signature mismatch');
    return res.status(403).send('Invalid signature');
  }

  // 5) Acknowledge immediately
res.status(200).end();

// 6) Filter to app_mention...
// 7) Grab userText
const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
console.log('🤖 User said:', JSON.stringify(userText));

// 8) **STUB** bypass OpenAI
const reply = `✅ (stub) Received: ${userText}`;
console.log('✏️ Using stub reply:', reply);

// 9) Post back to Slack
try {
  console.log('📨 Posting stub to Slack...');
  const slackRes = await slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: reply,
  });
  console.log('✅ Slack API ok:', slackRes.ok, 'ts:', slackRes.ts);
} catch (err) {
  console.error('❌ Error posting to Slack:', err);
}
