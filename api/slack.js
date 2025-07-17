import crypto from 'crypto';
import axios from 'axios';

export default async function handler(req, res) {
  // 1) Skip Slack retries
  if (req.headers['x-slack-retry-num']) {
    console.log('🛑 Skipping Slack retry:', req.headers['x-slack-retry-num']);
    return res.status(200).end();
  }

  // 2) Only accept POST
  if (req.method !== 'POST') {
    console.log('⚠️ Non‑POST received:', req.method);
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

  // 5) Ack Slack immediately
  res.status(200).end();

  // 6) Extract the event and filter
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    console.log('🔄 Ignoring event:', event?.type, 'bot?', !!event?.bot_id);
    return;
  }

  // 7) Parse user text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', JSON.stringify(userText));

  // 8) STUB reply
  const reply = `✅ (stub) Received: ${userText}`;
  console.log('✏️ Using stub reply:', reply);

  // 9) Post via Axios to Slack API
  console.log('📨 Posting stub via axios to Slack...');
  try {
    const slackRes = await axios.post(
      'https://slack.com/api/chat.postMessage',
      {
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: reply
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Slack HTTP status:', slackRes.status);
    console.log('✅ Slack response body:', slackRes.data);
  } catch (err) {
    console.error('❌ Axios to Slack failed:', err);
  }
}
