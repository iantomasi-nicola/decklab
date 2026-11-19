import { readFileSync } from 'node:fs'
const d = readFileSync('node_modules/@n1xx1/ocgcore-wasm/dist/index.d.ts', 'utf8')
const enumBody = d.match(/export declare enum OcgMessageType \{([\s\S]*?)\n\}/)[1]
const types = [...enumBody.matchAll(/^\s+([A-Z_]+) = (\d+)/gm)].map((m) => [m[1], +m[2]])
const ifaces = {}
for (const m of d.matchAll(/export declare interface (OcgMessage\w+)(?: extends (\w+))? \{([\s\S]*?)\n\}/g)) ifaces[m[1]] = { ext: m[2], body: m[3] }
const byType = {}
for (const [n, b] of Object.entries(ifaces)) { const t = b.body.match(/type: OcgMessageType\.(\w+)/); if (t) byType[t[1]] = [n, [...b.body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\s+(\w+)\??: ([^;]+);/gm)].filter((x) => x[1] !== 'type').map((x) => x[1]).join(', ') + (b.ext ? ' (+' + b.ext + ')' : '')] }
console.log(JSON.stringify(types.map(([n, v]) => ({ name: n, id: v, iface: byType[n]?.[0], fields: byType[n]?.[1] })), null, 0))
