import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAssistantResponse(userMessage, threadId = null) {
  console.log('💬 getAssistantResponse:', { userMessage, threadId });

  try {
    // 1) Create thread if needed
    let tId = threadId;
    if (!tId) {
      console.log('⏳ Creating new OpenAI thread…');
      const t = await openai.beta.threads.create();
      tId = t.id;
    }

    // 2) Post user message
    await openai.beta.threads.messages.create(tId, {
      role: 'user',
      content: userMessage
    });

    // 3) Run assistant
    const run = await openai.beta.threads.runs.create(tId, {
      assistant_id: process.env.ASSISTANT_ID
    });

    // 4) Poll until done
    let status;
    do {
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(tId, run.id);
      console.log('⏲️ Run status:', status.status);
    } while (status.status !== 'completed');

    // 5) Fetch and return reply
    const msgs = await openai.beta.threads.messages.list(tId);
    const reply = msgs.data[0].content[0].text.value;
    console.log('✅ OpenAI reply:', reply);
    return { reply, threadId: tId };
  } catch (err) {
    console.error('❌ OpenAI error:', err);
    return { reply: "Sorry, something went wrong getting your campaign idea.", threadId };
  }
}
