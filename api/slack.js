import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from '../lib/assistant.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export default async function handler(req, res) {
  // 1) Skip Slack retry attempts
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 2) Only accept POST
  if (req.method !== 'POST') {
    console.log('⚠️ Non‑POST received:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  // 3) URL verification handshake
  if (req.body?.type === 'url_verification') {
    console.log('🔑 URL verification challenge');
    return res.status(200).send(req.body.challenge);
  }

  // 4) Signature verification
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

  // 5) ACK immediately to prevent Slack retries
  res.status(200).end();

  // 6) Process only real app_mention events
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    console.log('🔄 Ignoring event:', event?.type, 'bot?', !!event?.bot_id);
    return;
  }

  // 7) Extract the user’s text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', JSON.stringify(userText));

  // 8) Call your deployed Assistant by ID
  let reply;
  try {
    console.log('⏳ Asking Assistant (ID)...');
    reply = await getAssistantResponse(userText);
    console.log('✅ Assistant replied:', JSON.stringify(reply));
  } catch (err) {
    console.error('❌ Error in getAssistantResponse:', err);
    reply = 'Sorry, something went wrong getting your idea.';
  }

  // 9) Post the reply back into the thread
  try {
    console.log('📨 Posting reply to Slack...');
    const slackRes = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: reply
    });
    console.log('✅ Slack API ok:', slackRes.ok, 'ts:', slackRes.ts);
  } catch (err) {
    console.error('❌ Error posting to Slack:', err);
  }
}
