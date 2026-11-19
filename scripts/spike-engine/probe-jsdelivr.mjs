import { readdirSync } from 'node:fs'
const dir = process.argv[2]; const C = '5b613bfc3c122f48238e32f85015b32892577a42'
const files = readdirSync(dir + '/official').filter(f => f.endsWith('.lua'))
const sample = []; for (let i = 0; i < 400; i++) sample.push('official/' + files[Math.floor(i * files.length / 400)])
sample.push('debug_utility.lua', 'proc_skill.lua', 'proc_spirit.lua', 'proc_gemini.lua')
async function probe(base, list) { const res = {}; let i = 0; const bad = []
  await Promise.all(Array.from({ length: 16 }, async () => { while (i < list.length) { const k = list[i++]; const r = await fetch(base + k); res[r.status] = (res[r.status] ?? 0) + 1; if (r.status !== 200) bad.push(k); await r.arrayBuffer() } }))
  return { res, bad } }
for (const base of [`https://cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@${C}/`, `https://raw.githubusercontent.com/ProjectIgnis/CardScripts/${C}/`]) {
  const t = performance.now(); const r = await probe(base, sample); console.log(base.slice(0, 40), JSON.stringify(r.res), r.bad.slice(0, 8).join(','), (performance.now() - t).toFixed(0) + 'ms') }
