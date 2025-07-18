// lib/assistant.js
import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAssistantResponse(userMessage) {
  console.log('🚀 getAssistantResponse() invoked with:', userMessage);

  try {
    console.log('⏳ Creating a new thread…');
    const thread = await openai.beta.threads.create();

    console.log('✉️ Posting user message to thread…');
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    console.log('▶️ Running assistant…');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });

    // Poll until it’s done
    let status;
    do {
      console.log('⏲️ Checking run status…');
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (status.status !== 'completed');

    console.log('📬 Fetching assistant reply…');
    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data?.[0]?.content?.[0]?.text?.value ?? '';

    console.log('✅ Assistant response:', reply);
    return reply;

  } catch (err) {
    console.error('❌ Assistant API error:', err);
    return 'Sorry, something went wrong getting your idea.';
  }
}
