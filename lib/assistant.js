// lib/assistant.js

import OpenAI from 'openai';
import { config } from 'dotenv';
config();

// sanity‑check your env
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('💬 Asking Assistant (ID):', JSON.stringify(userMessage));

  try {
    // Call your Assistant by ID
    const response = await openai.chat.completions.create({
      assistant_id: process.env.ASSISTANT_ID,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });

    const reply = response.choices?.[0]?.message?.content ?? '';
    console.log('✅ Assistant replied:', JSON.stringify(reply));
    return reply;

  } catch (err) {
    console.error('❌ Assistant API error:', err);
    return 'Sorry, something went wrong getting your idea.';
  }
}
