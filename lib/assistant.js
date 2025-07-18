// /lib/assistant.js
import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAssistantResponse(userMessage, existingThreadId = null) {
  console.log('💬 getAssistantResponse', { userMessage, existingThreadId });

  try {
    // 1) Reuse or create a thread
    let threadId = existingThreadId;
    if (!threadId) {
      console.log('⏳ Creating new OpenAI thread…');
      const { id } = await openai.beta.threads.create();
      threadId = id;
    } else {
      console.log('🔁 Reusing existing OpenAI thread:', threadId);
    }

    // 2) Post the user's message into that thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: userMessage
    });

    // 3) Run the assistant in that thread
    const { id: runId } = await openai.beta.threads.runs.create(threadId, {
      assistant_id: process.env.ASSISTANT_ID
    });

    // 4) Poll until completion
    let status;
    do {
      await new Promise(r => setTimeout(r, 1000));
      const result = await openai.beta.threads.runs.retrieve(threadId, runId);
      status = result.status;
      console.log('⏲️ Run status:', status);
    } while (status !== 'completed');

    // 5) Fetch and return the assistant’s reply
    const messages = await openai.beta.threads.messages.list(threadId);
    const reply = messages.data[0].content[0].text.value;
    console.log('✅ OpenAI reply:', reply);

    return { reply, threadId };
  } catch (err) {
    console.error('❌ OpenAI error:', err);
    return {
      reply: 'Sorry, something went wrong getting your campaign idea.',
      threadId: existingThreadId
    };
  }
}
