import { Octokit } from '@octokit/rest';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = 'your-username-or-org';
const repo = 'your-repo-name';
const path = 'data/events.csv';

export async function hasEventBeenHandled(eventId) {
  const { data: file } = await octokit.repos.getContent({ owner, repo, path });
  const csv = Buffer.from(file.content, 'base64').toString('utf-8');
  const records = parse(csv, { columns: false });
  return records.some(([id]) => id === eventId);
}

export async function logHandledEvent(eventId) {
  const { data: file } = await octokit.repos.getContent({ owner, repo, path });
  const csv = Buffer.from(file.content, 'base64').toString('utf-8');
  const records = parse(csv, { columns: false });
  records.push([eventId]);
  const newContent = stringify(records);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `Log event ${eventId}`,
    content: Buffer.from(newContent).toString('base64'),
    sha: file.sha,
  });
}
