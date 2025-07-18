// lib/assistant.js
import OpenAI from 'openai';
import { config } from 'dotenv';
config();

// sanity check
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('🚀 getAssistantResponse() invoked with:', userMessage);

  try {
    console.log('⏳ Calling chat.completions.create with assistant_id…');
    const resp = await openai.chat.completions.create({
      // Instead of model, pass assistant_id:
      assistant_id: process.env.ASSISTANT_ID,
      messages: [
        { role: 'user', content: userMessage }
      ],
      // Optional: you can set a timeout for safety
      timeout: 30_000
    });

    const reply = resp.choices?.[0]?.message?.content ?? '';
    console.log('✅ Assistant replied:', JSON.stringify(reply));
    return reply;

  } catch (err) {
    console.error('❌ Assistant API error:', err);
    return 'Sorry, I ran into a problem getting your idea.';
  }
}
