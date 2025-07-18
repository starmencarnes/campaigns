import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getAssistantResponse(userMessage) {
  console.log('💬 Asking OpenAI Assistant:', userMessage);

  try {
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });

    let status;
    do {
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (status.status !== 'completed');

    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data[0].content[0].text.value;
    console.log('✅ OpenAI reply:', reply);
    return reply;
  } catch (err) {
    console.error('❌ OpenAI error:', err);
    return "Sorry, something went wrong getting your campaign idea.";
  }
}
