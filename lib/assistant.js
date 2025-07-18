// lib/assistant.js
import OpenAI from 'openai';
import { config } from 'dotenv';
config();

// sanity checks
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID loaded:', process.env.ASSISTANT_ID);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAssistantResponse(userMessage) {
  console.log('🚀 getAssistantResponse() invoked with:', userMessage);

  try {
    console.log('⏳ Calling chat.completions.create with assistant…');
    const response = await openai.chat.completions.create({
      assistant: process.env.ASSISTANT_ID,     // <— note the key name here
      messages: [
        { role: 'user', content: userMessage }
      ],
      timeout: 15_000
    });

    console.log('✅ Raw response object:', JSON.stringify(response, null, 2));
    const reply = response.choices?.[0]?.message?.content ?? '';
    console.log('📬 Extracted reply:', reply);
    return reply;

  } catch (err) {
    console.error('❌ Assistant API error:', err);
    return 'Sorry, something went wrong getting your idea.';
  }
}
