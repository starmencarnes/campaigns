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

    // 3) Run the assistant and poll until completion
    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: process.env.ASSISTANT_ID
    });
    console.log('⏲️ Run status:', run.status);

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
