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

  // 5) Ack immediately
  res.status(200).end();

  // 6) Only process actual “app_mention” callbacks
  if (req.body.type !== 'event_callback') {
    console.log('🔄 Ignoring non‐event_callback:', req.body.type);
    return;
  }
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    console.log('🔄 Ignoring non‐app_mention or bot event:', event?.type);
    return;
  }

  // 7) Strip mention and log the incoming text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', JSON.stringify(userText));

  // 8) Call the Assistant (with try/catch and logs)
  let reply;
  try {
    console.log('⏳ Calling OpenAI Assistant...');
    reply = await getAssistantResponse(userText);
    console.log('✅ Assistant replied:', JSON.stringify(reply));
  } catch (err) {
    console.error('❌ Error in getAssistantResponse:', err);
    // (Optional) send an error message back to Slack
    return;
  }

  // 9) Post back to Slack (with logs)
  try {
    console.log('📨 Posting message to Slack thread...');
    const slackRes = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: reply,
    });
    console.log('✅ Slack API ok:', slackRes.ok, 'ts:', slackRes.ts);
  } catch (err) {
    console.error('❌ Error posting to Slack:', err);
  }
}

