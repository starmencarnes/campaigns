// lib/assistant.js
import OpenAI from 'openai';
import { config } from 'dotenv';
config();

// sanity checks
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('🚀 getAssistantResponse() invoked with:', userMessage);

  try {
    console.log('⏳ Calling chat.completions.create with assistant_id…');
    const response = await openai.chat.completions.create({
      assistant_id: process.env.ASSISTANT_ID,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });

    const reply = response.choices?.[0]?.message?.content ?? '';
    console.log('✅ Assistant replied:', reply);
    return reply;

  } catch (err) {
    console.error('❌ Assistant API error:', err);
    return 'Sorry, something went wrong getting your idea.';
  }
}
