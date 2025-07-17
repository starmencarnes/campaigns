// lib/assistant.js

import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

// 🔑 Log that our env vars are loaded
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('💬 Asking OpenAI Assistant:', JSON.stringify(userMessage));

  try {
    // 1) Create a new thread
    console.log('📌 Creating thread...');
    const thread = await openai.beta.threads.create();
    console.log('📬 Thread created with id:', thread.id);

    // 2) Send user message to thread
    console.log('📌 Sending user message to thread...');
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });
    console.log('✅ User message sent');

    // 3) Kick off the assistant run
    console.log('📌 Starting assistant run...');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });
    console.log('🤖 Assistant run created with id:', run.id);

    // 4) Poll until completion
    let status;
    do {
      console.log('⏳ Checking run status...');
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('⏳ Current status:', status.status);
    } while (status.status !== 'completed');

    // 5) Fetch the messages
    console.log('📬 Fetching messages from thread...');
    const messages = await openai.beta.threads.messages.list(thread.id);

    // 6) Extract the assistant’s reply
    const reply = messages.data[0].content[0].text.value;
    console.log('✅ OpenAI reply:', JSON.stringify(reply));
    return reply;

  } catch (err) {
    console.error('❌ OpenAI error:', err);
    // Return a fallback so your Slack code doesn’t hang
    return "Sorry, I ran into a problem getting your campaign idea.";
  }
}
