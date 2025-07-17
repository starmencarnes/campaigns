import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from '../lib/assistant.js';
import { hasSeenEvent, storeEvent } from '../lib/eventStore.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function handleSlackEvent(event) {
  const eventId = event.event_id || event.client_msg_id || event.event?.ts;

  if (!eventId) {
    console.warn('⚠️ Missing deduplication key');
    return;
  }

  const seen = await hasSeenEvent(eventId);
  if (seen) {
    console.log('🛑 Duplicate event ignored:', eventId);
    return;
  }

  // Store immediately to avoid race conditions
  await storeEvent(eventId);

  console.log('🤖 Received mention:', event.text);
  console.log('💬 Asking OpenAI Assistant:', event.text);

  const reply = await getAssistantResponse(event.text);

  console.log('✅ OpenAI reply:', reply);
  console.log('📨 Replying in Slack thread...');

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
