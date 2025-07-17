import crypto from 'crypto';

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

  // 3) URL verification handshake
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

  // 6) Pull out the event and ignore non‑app_mention or bot messages
  const event = req.body.event;
  if (!event || event.type !== 'app_mention' || event.bot_id) {
    console.log('🔄 Ignoring event:', event?.type, 'bot?', !!event?.bot_id);
    return;
  }

  // 7) Get the user’s text
  const userText = event.text.replace(/<@[^>]+>\s*/, '').trim();
  console.log('🤖 User said:', JSON.stringify(userText));

  // 8) STUB: Bypass OpenAI
  const reply = `✅ (stub) Received: ${userText}`;
  console.log('✏️ Using stub reply:', reply);

  // 9) Confirm token and POST via fetch
  console.log('🔑 SLACK_BOT_TOKEN loaded:', !!process.env.SLACK_BOT_TOKEN);
  console.log('📨 Posting stub via fetch to Slack...');
  try {
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
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
    const slackData = await slackResponse.json();
    console.log('✅ Slack HTTP status:', slackResponse.status);
    console.log('✅ Slack response body:', slackData);
  } catch (err) {
    console.error('❌ fetch to Slack failed:', err);
  }
}
