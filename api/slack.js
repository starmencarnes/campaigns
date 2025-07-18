import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();
export const configFile = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 1) Skip Slack retry attempts
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 2) Signature check
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

  // 3) Ack immediately
  res.status(200).end();

  // 4) Only handle app_mention from humans
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    return;
  }

  // 5) Extract and log
  const text = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', text);

  // 6) Get reply
  let reply;
  try {
    reply = await getAssistantResponse(text);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = 'Sorry, something went wrong getting your idea.';
  }
  console.log('✅ Assistant replied:', reply);

  // 7) Prepare payload (no thread for now)
  console.log('🔑 SLACK_BOT_TOKEN loaded:', !!process.env.SLACK_BOT_TOKEN);
  const payload = { channel: event.channel, text: reply };
  console.log('📨 Posting to Slack with payload:', JSON.stringify(payload));

  // 8) Send and log response
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
    const data = await slackRes.json();
    console.log('ℹ️ Slack response body:', data);
  } catch (err) {
    console.error('❌ Network error posting to Slack:', err);
  }
}
