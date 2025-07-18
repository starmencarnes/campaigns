// /api/slack.js
import crypto from 'crypto';
import { config } from 'dotenv';
import { getAssistantResponse } from '../lib/assistant.js';

config();
export const configFile = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  // 0) Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) Slack URL challenge
  if (req.body?.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2) Skip Slack retry attempts
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    console.log('🛑 Skipping Slack retry:', retryNum);
    return res.status(200).end();
  }

  // 3) Verify signature
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const bodyRaw = JSON.stringify(req.body);
  const expectedSig = 'v0=' +
    crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${bodyRaw}`)
      .digest('hex');
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(signature)
    )
  ) {
    console.error('❌ Signature mismatch', { expectedSig, signature });
    return res.status(403).send('Invalid signature');
  }

  // Pull out the event
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    // nothing for us to do
    return res.status(200).end();
  }

  const channel   = event.channel;
  const thread_ts = event.thread_ts || event.ts;
  const userText  = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', userText);

  // 4) Immediate “I’m on it!” ping
  console.log('📨 Posting immediate acknowledgement…');
  try {
    const pingRes = await fetch(
      'https://slack.com/api/chat.postMessage',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          thread_ts,
          text: "👋 I’m on it! Give me a sec…"
        })
      }
    );
    const pingJson = await pingRes.json();
    console.log('ℹ️ Ping response:', pingJson);
  } catch (err) {
    console.error('❌ Error sending ping:', err);
  }

  // 5) Call your (stubbed) assistant
  console.log('⏳ Calling getAssistantResponse with:', userText);
  let aiReply;
  try {
    aiReply = await getAssistantResponse(userText);
    console.log('✅ Assistant replied:', aiReply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    aiReply = 'Sorry, something went wrong getting your idea.';
  }

  // 6) Post the final answer
  console.log('📨 Posting final stub reply…');
  try {
    const replyRes = await fetch(
      'https://slack.com/api/chat.postMessage',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          thread_ts,
          text: aiReply
        })
      }
    );
    const replyJson = await replyRes.json();
    console.log('ℹ️ Reply response:', replyJson);
  } catch (err) {
    console.error('❌ Error sending final reply:', err);
  }

  // 7) Finally ACK Slack
  return res.status(200).send('OK');
}
