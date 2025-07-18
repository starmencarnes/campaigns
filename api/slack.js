import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();

// Bind to Node 18 on Vercel
export const configFile = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  // 0) Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) Handle Slack URL verification handshake
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) Skip Slack’s HTTP retry attempts
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 3) Verify Slack request signature
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

  // 4) Acknowledge immediately to prevent any further retries
  res.status(200).end();

  // 5) Only process "app_mention" events from users
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return;
  }

  // 6) Extract the user's text
  const text = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', text);

  // 7) Call your assistant
  let reply;
  try {
    console.log('⏳ Calling getAssistantResponse with:', text);
    reply = await getAssistantResponse(text);
    console.log('✅ Assistant replied:', reply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = 'Sorry, something went wrong getting your idea.';
  }

  // 8) Post back *in the same thread*
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
