import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from '../lib/assistant.js';
import { hasEventBeenHandled, logHandledEvent } from '../lib/githubCsv.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body.event;
  const eventId = req.body.event_id || event?.client_msg_id || event?.ts;

  if (!eventId) {
    console.warn('⚠️ Missing deduplication key');
    return res.status(400).json({ error: 'Missing event ID' });
  }

  // Respond early to avoid Slack timeouts
  res.status(200).end();

  if (await hasEventBeenHandled(eventId)) {
    console.log('🛑 Duplicate event ignored:', eventId);
    return;
  }

  await logHandledEvent(eventId);
  console.log('✅ Event marked as handled:', eventId);

  const reply = await getAssistantResponse(event.text);
  console.log('✅ OpenAI reply:', reply);

  try {
    const result = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: reply,
    });
    console.log('✅ Slack response:', result);
  } catch (err) {
    console.error('❌ Error sending message to Slack:', err);
  }
}
