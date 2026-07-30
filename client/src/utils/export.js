import { apiUrl } from './api.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(title) {
  return (title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

export async function exportSessionAsJson(sessionId) {
  const res = await fetch(apiUrl(`/api/chat/${sessionId}`));
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFilename(data.title)}.json`);
}

export async function exportSessionAsMarkdown(sessionId) {
  const res = await fetch(apiUrl(`/api/chat/${sessionId}`));
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();

  let md = `# ${data.title || 'Chat'}\n\n`;
  for (const msg of data.history || []) {
    const role = msg.role === 'user' ? '**You**' : '**Assistant**';
    md += `${role}:\n${msg.content || ''}\n\n---\n\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  downloadBlob(blob, `${sanitizeFilename(data.title)}.md`);
}

export async function importSessionFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  const res = await fetch(apiUrl('/api/chat/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Import failed');
  }

  const result = await res.json();
  return result.sessionId;
}
