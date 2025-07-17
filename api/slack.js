import crypto from 'crypto';
import { getAssistantResponse } from '../lib/assistant.js';

export const configFile = {
  runtime: 'nodejs18.x'
};

// In‑memory dedupe
const seen = new Set();

export default async function handler(req, res) {
  // 0) Only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1) Collect raw body
  let raw = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => raw += chunk.toString());
    req.on('end', resolve);
    req.on('error', reject);
  });

  // 2) Parse JSON
  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Invalid JSON:', err);
    return res.status(400).send('Invalid JSON');
  }

  // 3) URL verification
  if (body.type === 'url_verification') {
    return res.status(200).send(body.challenge);
  }

  // 4) Skip Slack retries
  const retry = req.headers['x-slack-retry-num'];
  if (retry) {
    console.log('🛑 Skipping Slack retry:', retry);
    return res.status(200).end();
  }

  // 5) Verify signature against the raw body
  const sig = req.headers['x-slack-signature'];
  const ts  = req.headers['x-slack-request-timestamp'];
  const basestring = `v0:${ts}:${raw}`;
  const mySig = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(basestring)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig))) {
    console.error('❌ Signature mismatch', { expected: mySig, got: sig });
    return res.status(403).send('Invalid signature');
  }

  // 6) Ack immediately
  res.status(200).end();

  // 7) Only handle app_mention
  const event = body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    console.log('🔄 Ignoring event:', event?.type, 'bot?', !!event?.bot_id);
    return;
  }

  // 8) De‑duplicate by event_id
  const id = body.event_id;
  if (seen.has(id)) {
    console.log('⚠️ Duplicate event detected, skipping:', id);
    return;
  }
  console.log('✅ New event, processing:', id);
  seen.add(id);

  // 9) Extract text, call assistant
  const text = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', text);

  let reply;
  try {
    console.log('⏳ Calling assistant…');
    reply = await getAssistantResponse(text);
    console.log('✅ Assistant replied:', reply);
  } catch (err) {
    console.error('❌ Assistant error:', err);
    reply = "Sorry, something went wrong getting your idea.";
  }

  // 10) Threaded reply
  try {
    console.log('📨 Posting reply…');
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
    console.log('✅ Slack response:', data);
  } catch (err) {
    console.error('❌ Error posting to Slack:', err);
  }
}
