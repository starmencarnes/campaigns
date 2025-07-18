// lib/assistant.js
import { config } from 'dotenv';
config();

// sanity checks
console.log('🔑 OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('🔑 ASSISTANT_ID     loaded:', process.env.ASSISTANT_ID);

const API_BASE = 'https://api.openai.com/v1';

export async function getAssistantResponse(userMessage) {
  // 1) kick off a new assistant run
  console.log('⏳ Starting assistant run…');
  const createRes = await fetch(
    `${API_BASE}/assistants/${process.env.ASSISTANT_ID}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        inputs: {
          messages: [
            { role: 'user', content: userMessage }
          ]
        }
      })
    }
  );
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Run creation failed: ${createRes.status} ${err}`);
  }
  const { id: runId } = await createRes.json();
  console.log('▶️ Run created:', runId);

  // 2) poll for status
  let status, statusJson;
  do {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(
      `${API_BASE}/assistant_runs/${runId}`,
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    statusJson = await statusRes.json();
    status = statusJson.status;
    console.log(`⏲️ Run status: ${status}`);
    if (status === 'failed') {
      throw new Error(`Assistant run failed: ${JSON.stringify(statusJson)}`);
    }
  } while (status !== 'succeeded');

  // 3) extract and return the assistant’s reply
  const reply = statusJson.outputs?.messages?.[0]?.text;
  console.log('✅ Assistant reply:', reply);
  return reply || 'Sorry, I got no response from the Assistant.';
}
