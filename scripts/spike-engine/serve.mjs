import http from 'node:http'; import { createReadStream, statSync } from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'
const root = new URL('.', import.meta.url).pathname
const csRoot = process.env.CS_ROOT
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.lua': 'text/plain' }
http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); let base = root
  if (p.startsWith('/cs/')) { base = csRoot; p = p.slice(3) }
  const f = path.join(base, p === '/' ? 'index.html' : p)
  try { const st = statSync(f); const ext = path.extname(f)
    s.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream', 'content-length': st.size, 'access-control-allow-origin': '*' })
    createReadStream(f).pipe(s) } catch { s.writeHead(404); s.end('nf') }
}).listen(+process.env.PORT || 8765, () => console.log('up'))
