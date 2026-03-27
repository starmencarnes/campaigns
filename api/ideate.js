import crypto from 'crypto';
import dotenv from ‘dotenv’;
import { getAssistantResponse } from ‘../lib/assistant.js’;
import fetch from ‘node-fetch’; // if you’re on Node18+ you can omit this import

dotenv.config();

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // 1) Only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2) Capture raw body for signature check
  let buf = '';
  await new Promise((resolve, reject) => {
    req.on('data', c => buf += c);
    req.on('end', resolve);
    req.on('error', reject);
  });

  const body = Object.fromEntries(new URLSearchParams(buf));

  // 3) Verify Slack signature
  const sig = req.headers['x-slack-signature'];
  const ts  = req.headers['x-slack-request-timestamp'];
  const base = `v0:${ts}:${buf}`;
  const mySig = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(base)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig))) {
    console.error('❌ Invalid signature:', { expected: mySig, got: sig });
    return res.status(403).send('Invalid signature');
  }

  // 4) Acknowledge immediately (empty body = HTTP 200)
  res.status(200).end();

  // 5) Grab the user’s command text & response_url
  const prompt      = body.text || '';
  const responseUrl = body.response_url;
  console.log('🤖 /ideate prompt:', prompt);

  // 6) Call your Assistant
  let reply;
  try {
    reply = await getAssistantResponse(prompt);
    console.log('✅ Assistant reply:', reply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = "Sorry, I couldn't generate an idea right now.";
  }

  // 7) Send the reply to the original channel via response_url
  try {
    const post = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // `in_channel` makes it visible to the whole channel;
        // use `ephemeral` to show only to the user:
        response_type: 'in_channel',
        text: reply
      })
    });
    console.log('📨 response_url status:', post.status);
  } catch (err) {
    console.error('❌ Error posting to response_url:', err);
  }
}
