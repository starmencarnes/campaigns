// /lib/assistant.js
import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAssistantResponse(userMessage, threadId = null) {
  console.log('💬 getAssistantResponse:', { userMessage, threadId });

  try {
    // 1) Create a new thread if none exists
    let thread = { id: threadId };
    if (!threadId) {
      console.log('⏳ Creating new OpenAI thread…');
      const t = await openai.beta.threads.create();
      thread.id = t.id;
    }

    // 2) Post the user’s message into that thread
    console.log('✉️ Posting user message…');
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    // 3) Run the assistant in that thread
    console.log('▶️ Running assistant…');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });

    // 4) Poll until completion
    let status;
    do {
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('⏲️ Run status:', status.status);
    } while (status.status !== 'completed');

    // 5) Fetch and return the assistant’s reply + threadId
    const msgs = await openai.beta.threads.messages.list(thread.id);
    const reply = msgs.data[0].content[0].text.value;
    console.log('✅ OpenAI reply:', reply);
    return { reply, threadId: thread.id };
  } catch (err) {
    console.error('❌ OpenAI error:', err);
    return { reply: "Sorry, something went wrong getting your campaign idea.", threadId };
  }
}
