// Genera schema/combo.v1.schema.json dallo schema zod (src/domain/combo/schema.ts).
// Uso: node scripts/gen-combo-schema.mjs [--check]   (--check: fallisce se il file committato non coincide; per la CI)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { comboSchema } = await import(pathToFileURL(resolve(root, 'src/domain/combo/schema.ts')).href)

const json = z.toJSONSchema(comboSchema, { target: 'draft-2020-12', io: 'input' })
json.$id = 'https://combolab.app/schema/combo.v1.schema.json'
json.title = 'combolab.combo v1'
const out = JSON.stringify(json, null, 2) + '\n'
const file = resolve(root, 'schema/combo.v1.schema.json')

if (process.argv.includes('--check')) {
  let cur = ''
  try { cur = readFileSync(file, 'utf8') } catch {}
  if (cur !== out) { console.error('schema/combo.v1.schema.json non aggiornato: esegui node scripts/gen-combo-schema.mjs'); process.exit(1) }
  console.log('schema ok')
} else {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, out)
  console.log('scritto', file)
}
