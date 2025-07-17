import fs from 'fs/promises';
import path from 'path';

const EVENTS_FILE = path.resolve('./data/events.csv');

export async function hasSeenEvent(eventId) {
  try {
    const data = await fs.readFile(EVENTS_FILE, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    return lines.includes(eventId);
  } catch (err) {
    console.error('Error reading events file:', err);
    return false;
  }
}

export async function storeEvent(eventId) {
  try {
    await fs.appendFile(EVENTS_FILE, `${eventId}\n`, 'utf-8');
    console.log('✅ Stored event ID:', eventId);
  } catch (err) {
    console.error('Error writing to events file:', err);
  }
}
