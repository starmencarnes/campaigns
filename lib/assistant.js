// lib/assistant.js

import OpenAI from 'openai';
import { config } from 'dotenv';
config();

// sanity‐check your env
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('💬 Chat completion for:', JSON.stringify(userMessage));
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful campaign‑ideation assistant for local newsletters.' },
        { role: 'user', content: userMessage }
      ]
    });
    const reply = response.choices?.[0]?.message?.content;
    console.log('✅ Chat completion reply:', JSON.stringify(reply));
    return reply;
  } catch (err) {
    console.error('❌ Chat completion error:', err);
    return 'Sorry, something went wrong getting your idea.';
  }
}
