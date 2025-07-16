import { WebClient } from '@slack/web-api';
import { getAssistantResponse } from './assistant.js';
import { get, set } from '@vercel/edge-config';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function handleSlackEvent(event) {
  const eventId = event.event_id || event.client_msg_id || event.event?.ts;

  if (!eventId) {
    console.warn('⚠️ Missing deduplication key');
    return;
  }

  const alreadyHandled = await get(eventId);
  if (alreadyHandled) {
    console.log('🛑 Duplicate event ignored:', eventId);
    return;
  }

  // Mark as processed before continuing to avoid race conditions
  await set(eventId, true);
  console.log('✅ Event marked as handled:', eventId);

  console.log('🤖 Received mention:', event.text);
  console.log('💬 Asking OpenAI Assistant:', event.text);

  const reply = await getAssistantResponse(event.text);

  console.log('✅ OpenAI reply:', reply);
  console.log('📨 Replying in Slack thread...');

  try {
    const result = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts, // Reply in the thread
      text: reply,
    });

    console.log('✅ Slack response:', result);
  } catch (err) {
    console.error('❌ Error sending message to Slack:', err);
  }
}
