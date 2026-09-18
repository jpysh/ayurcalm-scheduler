// AyurCalm for Claude Desktop (#119).
//
// Runs inside Claude Desktop, on the same computer as AyurCalm. Claude talks to
// it over stdin/stdout; it passes each message to AyurCalm's /mcp over plain
// HTTP on this machine and passes the answer back. Nothing goes to the internet.
// A PDF that comes back (the day sheet, the rota) is saved to Downloads, and
// Claude is told where.
//
// No dependencies: Claude Desktop runs this with its own Node.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const URL_ = process.env.AYURCALM_URL;
const KEY = process.env.AYURCALM_KEY;
let protocolVersion = null;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

function savePdfs(msg) {
  const content = msg && msg.result && Array.isArray(msg.result.content) ? msg.result.content : null;
  if (!content) return;
  msg.result.content = content.map((c) => {
    if (c.type !== 'resource' || !c.resource || c.resource.mimeType !== 'application/pdf' || !c.resource.blob) return c;
    const name = path.basename(String(c.resource.uri).replace(/^ayurcalm:\/\//, '')) || 'ayurcalm.pdf';
    const dir = fs.existsSync(path.join(os.homedir(), 'Downloads')) ? path.join(os.homedir(), 'Downloads') : os.tmpdir();
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.from(c.resource.blob, 'base64'));
    return { type: 'text', text: `Saved to ${file}` };
  });
}

async function forward(msg) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${KEY}` };
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
  let res;
  try {
    res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(msg) });
  } catch {
    if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `AyurCalm is not running at ${URL_}. Start it (docker compose up -d) and try again.` } });
    return;
  }
  if (res.status === 202 || msg.id === undefined) return;
  const text = await res.text();
  if (res.status === 401) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'AyurCalm refused this key. It was revoked or replaced: download the extension again from AyurCalm Settings.' } });
    return;
  }
  const replies = (res.headers.get('content-type') || '').includes('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
    : [text];
  for (const raw of replies) {
    let out;
    try { out = JSON.parse(raw); } catch { continue; }
    if (msg.method === 'initialize' && out.result && out.result.protocolVersion) protocolVersion = out.result.protocolVersion;
    savePdfs(out);
    send(out);
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  forward(msg);
});
