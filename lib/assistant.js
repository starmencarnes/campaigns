// lib/assistant.js
import fetch from 'node-fetch';
import { config } from 'dotenv';
config();

export async function getAssistantResponse(userMessage) {
  // 1) Create a new run
  const createRes = await fetch(
    `https://api.openai.com/v1/assistants/${process.env.ASSISTANT_ID}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        inputs: { messages: [{ role: 'user', content: userMessage }] }
      })
    }
  );
  const { id: runId } = await createRes.json();

  // 2) Poll until completion
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(
      `https://api.openai.com/v1/assistant_runs/${runId}`,
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    const statusJson = await statusRes.json();
    if (statusJson.status === 'succeeded') {
      // 3) Grab the first assistant message
      return statusJson.outputs.messages[0].text;
    }
    if (statusJson.status === 'failed') {
      throw new Error('Assistant run failed: ' + JSON.stringify(statusJson));
    }
  }
}
