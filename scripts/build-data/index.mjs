// Pipeline di build dei dati di Combo Lab. Uso: `npm run data:build [-- --force] [-- --offline]`
//   --force    riscrive gli output anche se il contenuto è identico
//   --offline  non scarica nulla: usa solo scripts/.cache (checkDBVer incluso: usa l'ultima versione in cache)
// Fonti: YGOPRODeck v7 (nomi/testi EN+IT, punti Genesys), BabelCDB (cards.cdb + release/prerelease: alias, setcode,
// type, race, attribute, level, atk, def), ProjectIgnis/LFLists (banlist OCG/TCG + cronologia git),
// ProjectIgnis/Distribution config/strings.conf (nomi archetipi).
// Output in public/data/: manifest.json, cards.<ver>.json, texts.<lang>.<ver>.json, banlists.<ver>.json, archetypes.<ver>.json.
// Formato di cards.<ver>.json: vedi src/domain/cards/cardsFormat.ts (colonnare).
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { download, fetchJson, exists } from './lib/net.mjs'
import { EXTRA_MASK, readCdb } from './lib/cdb.mjs'
import { deriveFromYgo } from './lib/ygoFallback.mjs'
import { fileVersions, syncRepo } from './lib/lflistHistory.mjs'
import { encodeCards } from '../../src/domain/cards/cardsFormat.ts'
import { lflistToBanlist, parseLflist } from '../../src/domain/legality/parseLflist.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT = join(ROOT, 'public', 'data')
const args = new Set(process.argv.slice(2))
const OFFLINE = args.has('--offline')
const FORCE = args.has('--force')

const YGO = 'https://db.ygoprodeck.com/api/v7'
const BABEL_RAW = 'https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master'
const STRINGS_URL = 'https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/strings.conf'
// cards.cdb ha priorità; gli altri contengono carte più recenti non ancora unite (release/prerelease).
// Esclusi: *-rush, *-skills*, goat-entries, cards-unofficial (anime/custom).
const EXTRA_CDBS = [
  'release-betb', 'prerelease-betb-en', 'prerelease-dbgv', 'prerelease-imph', 'prerelease-mvb1',
  'prerelease-others', 'prerelease-paso', 'prerelease-rv02', 'prerelease-yac1',
]

const log = (...a) => console.log('[data]', ...a)
const warnings = []
const warn = (m) => { warnings.push(m); console.warn('[warn]', m) }

// ---------- 1. versione + dump YGOPRODeck ----------
async function getDbVersion() {
  if (OFFLINE) {
    const files = (await readdir(CACHE)).filter((f) => /^ygo-.*-en\.json$/.test(f)).sort()
    if (!files.length) throw new Error('--offline ma nessun dump in cache')
    const f = files.at(-1)
    return { dbVersion: f.slice(4, -8), lastUpdate: null }
  }
  const r = await fetchJson(`${YGO}/checkDBVer.php`)
  return { dbVersion: r[0].database_version, lastUpdate: r[0].last_update }
}

async function loadYgo(dbVersion) {
  const en = await download(`${YGO}/cardinfo.php?misc=yes&format=genesys`, join(CACHE, `ygo-${dbVersion}-en.json`), { api: true })
  const it = await download(`${YGO}/cardinfo.php?misc=yes&format=genesys&language=it`, join(CACHE, `ygo-${dbVersion}-it.json`), { api: true })
  return { en: JSON.parse(en).data, it: JSON.parse(it).data }
}

// ---------- 2. cdb ----------
async function loadCdbs() {
  const dl = (name) => download(`${BABEL_RAW}/${name}.cdb`, join(CACHE, 'cdb', `${name}.cdb`), { refresh: !OFFLINE })
  await dl('cards')
  for (const n of EXTRA_CDBS) await dl(n)
  const merged = new Map()
  const origin = new Map()
  for (const n of ['cards', ...EXTRA_CDBS]) {
    for (const [id, row] of readCdb(join(CACHE, 'cdb', `${n}.cdb`))) {
      if (!merged.has(id)) { merged.set(id, row); origin.set(id, n) }
    }
  }
  return { cdb: merged, origin }
}

function remoteHead(url) {
  try { return execFileSync('git', ['ls-remote', url, 'HEAD'], { encoding: 'utf8' }).split(/\s/)[0] } catch { return null }
}

// ---------- 3. carte ----------
function buildCards(ygo, cdb) {
  const itById = new Map(ygo.it.map((c) => [c.id, c]))
  const main = ygo.en.filter((c) => c.type !== 'Skill Card') // Skill Card: solo Speed Duel/Duel Links, non giocabili
  const mainIds = new Set(main.map((c) => c.id))
  const parentOfImg = new Map()
  for (const c of main) for (const im of c.card_images ?? []) if (im.id !== c.id && !mainIds.has(im.id)) parentOfImg.set(im.id, c.id)

  const stats = { ygoMain: main.length, skillExcluded: ygo.en.length - main.length, derivedFromYgo: [], extraAlias: 0,
    synthAlias: 0, closure: 0, itMissing: 0, itNameMismatch: 0, htmlEntityNames: 0, aliasFromImagesOnly: 0 }

  const cards = new Map()
  const entity = /&(#\d+|amp|quot|apos|lt|gt);/
  for (const y of main) {
    const m = y.misc_info?.[0] ?? {}
    const row = cdb.get(y.id)
    const f = row ?? deriveFromYgo(y)
    if (!row) stats.derivedFromYgo.push(y.id)
    const itc = itById.get(y.id)
    if (!itc) stats.itMissing++
    else if (itc.name_en !== y.name) stats.itNameMismatch++
    if (entity.test(y.name)) stats.htmlEntityNames++
    const t = f.type
    cards.set(y.id, {
      id: y.id,
      alias: row?.alias ?? 0,
      name: { en: y.name, ...(itc && itc.name !== y.name ? { it: itc.name } : {}) },
      type: t, race: f.race, attribute: f.attribute, level: f.level, atk: f.atk, def: f.def,
      ...(f.scale !== undefined ? { scale: f.scale } : {}),
      setcodes: row?.setcodes ?? [],
      isExtra: (t & EXTRA_MASK) !== 0,
      ...(m.genesys_points > 0 ? { genesys: m.genesys_points } : {}),
      tcg: (m.formats ?? []).includes('TCG'),
      ocg: (m.formats ?? []).includes('OCG'),
    })
  }

  // artwork alternativi (alias) e basi mancanti: dal cdb o sintetizzati da card_images di YGOPRODeck
  const wanted = new Set()
  for (const [id, row] of cdb) {
    if (cards.has(id)) continue
    if ((row.alias && mainIds.has(row.alias)) || parentOfImg.has(id)) wanted.add(id)
  }
  for (const id of parentOfImg.keys()) wanted.add(id)
  const addExtra = (id) => {
    const row = cdb.get(id)
    // il cdb è l'autorità sugli alias; card_images di YGOPRODeck solo se il cdb non conosce la carta
    let parent = row ? row.alias : parentOfImg.get(id)
    if (parent && cards.get(parent)?.alias) parent = cards.get(parent).alias // niente catene
    const hint = parentOfImg.get(id)
    const base = parent ? cards.get(parent) : hint ? cards.get(hint) : undefined
    if (row && row.alias === 0 && hint && cards.get(hint)?.alias !== id) stats.aliasFromImagesOnly++
    if (!row && !base) return
    const src = row ?? base
    const sameName = base && (!row || row.name === base.name.en)
    const card = {
      id, alias: parent ?? 0,
      name: sameName ? { ...base.name } : { en: row.name },
      type: src.type, race: src.race, attribute: src.attribute, level: src.level, atk: src.atk, def: src.def,
      ...((row?.scale ?? base?.scale) !== undefined ? { scale: row?.scale ?? base.scale } : {}),
      setcodes: row?.setcodes ?? base?.setcodes ?? [],
      isExtra: (src.type & EXTRA_MASK) !== 0,
      ...(base?.genesys ? { genesys: base.genesys } : {}),
      tcg: base ? base.tcg : (row.ot & 2) !== 0,
      ocg: base ? base.ocg : (row.ot & 1) !== 0,
    }
    cards.set(id, card)
    row ? stats.extraAlias++ : stats.synthAlias++
  }
  for (const id of wanted) addExtra(id)
  // chiusura: basi di alias che non sono nel dataset ma esistono nel cdb (es. carte non in YGOPRODeck)
  for (let again = true; again; ) {
    again = false
    for (const c of [...cards.values()]) {
      if (c.alias && !cards.has(c.alias) && cdb.has(c.alias)) { addExtra(c.alias); stats.closure++; again = true }
    }
  }
  const orphanAliases = [...cards.values()].filter((c) => c.alias && !cards.has(c.alias))
  stats.orphanAliases = orphanAliases.map((c) => [c.id, c.alias])
  return { cards: [...cards.values()], main, itById, stats }
}

function buildTexts(main, itById) {
  const clean = (s) => (s ?? '').replace(/\r\n?/g, '\n').trim()
  const en = {}
  const it = {}
  for (const y of main) {
    en[y.id] = clean(y.desc)
    const t = itById.get(y.id)
    if (t) it[y.id] = clean(t.desc)
  }
  return { en, it }
}

// ---------- 4. banlist ----------
function buildBanlists(cards, ygoMain, dbVersion) {
  const aliasOf = new Map(cards.filter((c) => c.alias).map((c) => [c.id, c.alias]))
  const known = new Set(cards.map((c) => c.id))
  const canonical = (id) => aliasOf.get(id) ?? id
  const repo = join(CACHE, 'lflists')
  const head = OFFLINE ? execFileSync('git', ['rev-parse', 'origin/HEAD'], { cwd: repo, encoding: 'utf8' }).trim() : syncRepo(repo)
  const sources = [['OCG.lflist.conf', 'OCG'], ['0TCG.lflist.conf', 'TCG']]
  const byKey = new Map()
  const skippedNames = new Map()
  const duplicates = []
  const normalizedIds = new Set()
  for (const [file, format] of sources) {
    for (const v of fileVersions(repo, file, head)) {
      for (const list of parseLflist(v.text)) {
        if (list.name !== format) { skippedNames.set(list.name, (skippedNames.get(list.name) ?? 0) + 1); continue }
        // alcune testate storiche non hanno lo zero iniziale nel mese ("2023.1", "2023.4", "2023.7")
        const nid = list.id.replace(/^(\d{4})\.(\d)$/, '$1.0$2')
        if (nid !== list.id) { normalizedIds.add(`${list.id}->${nid}`); list.id = nid }
        const key = `${format}/${list.id}`
        const prev = byKey.get(key)
        if (prev) duplicates.push(`${key} (${prev.commit.slice(0, 7)} -> ${v.commit.slice(0, 7)})`)
        // la versione più recente della stessa testata vince (correzioni successive); la data resta la prima comparsa
        byKey.set(key, { list, format, commit: v.commit, date: prev?.date ?? v.date, lastDate: v.date })
      }
    }
  }
  const banlists = []
  const meta = []
  const unknownIds = new Map()
  const aliasHits = new Map()
  for (const { list, format, commit, date } of [...byKey.values()].sort((a, b) => (a.format + a.list.id).localeCompare(b.format + b.list.id))) {
    const b = lflistToBanlist(list, format, canonical)
    banlists.push(b)
    meta.push({ format, id: list.id, date, commit: commit.slice(0, 10), cards: Object.keys(b.limits).length })
    for (const id of Object.keys(list.entries).map(Number)) {
      if (!known.has(id)) unknownIds.set(id, [...(unknownIds.get(id) ?? []), `${format}/${list.id}`])
      else if (aliasOf.has(id)) aliasHits.set(id, (aliasHits.get(id) ?? 0) + 1)
    }
  }
  // Genesys: punti per carta base (da misc_info.genesys_points). Tetto NON noto: pointsCap lasciato undefined.
  const points = {}
  for (const y of ygoMain) {
    const p = y.misc_info?.[0]?.genesys_points
    if (p > 0) { const k = canonical(y.id); points[k] = Math.max(points[k] ?? 0, p) }
  }
  banlists.push({ format: 'GENESYS', id: dbVersion, limits: {}, points })
  meta.push({ format: 'GENESYS', id: dbVersion, date: null, commit: null, cards: Object.keys(points).length })
  return { banlists, meta, head, skippedNames, duplicates, unknownIds, aliasHits, normalizedIds }
}

// ---------- 5. archetipi ----------
async function buildArchetypes(cards) {
  const buf = await download(STRINGS_URL, join(CACHE, 'strings.conf'), { refresh: !OFFLINE })
  const map = new Map()
  for (const line of buf.toString('utf8').split(/\r?\n/)) {
    const m = /^!setname\s+(0x[0-9a-fA-F]+)\s+(.+?)\s*$/.exec(line)
    if (m) map.set(Number(m[1]), m[2])
  }
  const used = new Set(cards.flatMap((c) => c.setcodes))
  const unnamed = [...used].filter((s) => !map.has(s) && !map.has(s & 0xfff))
  const list = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([setcode, en]) => ({ setcode, name: { en } }))
  return { list, unnamed, total: map.size }
}

// ---------- 6. scrittura ----------
const sha = (s) => createHash('sha256').update(s).digest('hex')
const kb = (n) => (n / 1024).toFixed(1) + ' KB'

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(OUT, { recursive: true })
  const { dbVersion, lastUpdate } = await getDbVersion()
  log('YGOPRODeck database_version', dbVersion, lastUpdate ?? '')
  const ygo = await loadYgo(dbVersion)
  log(`dump EN ${ygo.en.length} carte, IT ${ygo.it.length} carte`)
  const { cdb, origin } = await loadCdbs()
  log(`cdb: ${cdb.size} righe uniche`)

  const { cards, main: ygoMain, itById, stats } = buildCards(ygo, cdb)
  const texts = buildTexts(ygoMain, itById)
  const bl = buildBanlists(cards, ygoMain, dbVersion)
  const arch = await buildArchetypes(cards)

  const json = {
    cards: JSON.stringify(encodeCards(cards)),
    'texts.en': JSON.stringify({ format: 'combo-lab/texts', v: 1, lang: 'en', texts: texts.en }),
    'texts.it': JSON.stringify({ format: 'combo-lab/texts', v: 1, lang: 'it', texts: texts.it }),
    banlists: JSON.stringify(bl.banlists),
    archetypes: JSON.stringify({ format: 'combo-lab/archetypes', v: 1, archetypes: arch.list }),
  }
  const version = `${dbVersion}-${sha(Object.values(json).join('\n')).slice(0, 8)}`
  const files = {
    cards: `cards.${version}.json`,
    banlists: `banlists.${version}.json`,
    archetypes: `archetypes.${version}.json`,
    texts: { en: `texts.en.${version}.json`, it: `texts.it.${version}.json` },
  }
  const names = { cards: files.cards, 'texts.en': files.texts.en, 'texts.it': files.texts.it, banlists: files.banlists, archetypes: files.archetypes }

  const manifestPath = join(OUT, 'manifest.json')
  let unchanged = false
  if (!FORCE && (await exists(manifestPath))) {
    const old = JSON.parse(await readFile(manifestPath, 'utf8'))
    unchanged = old.version === version && (await Promise.all(Object.values(names).map((n) => exists(join(OUT, n))))).every(Boolean)
  }
  const sizes = []
  for (const [k, name] of Object.entries(names)) {
    const body = json[k]
    sizes.push({ name, raw: Buffer.byteLength(body), gzip: gzipSync(body, { level: 9 }).length })
    if (!unchanged) await writeFile(join(OUT, name), body)
  }
  if (!unchanged) {
    const manifest = {
      schema: 1,
      version,
      builtAt: new Date().toISOString(),
      files,
      sources: {
        ygoprodeck: { dbVersion, lastUpdate },
        babelcdb: { commit: remoteHead('https://github.com/ProjectIgnis/BabelCDB.git'), files: ['cards.cdb', ...EXTRA_CDBS.map((n) => `${n}.cdb`)] },
        lflists: { commit: bl.head },
        archetypes: { url: STRINGS_URL },
      },
      counts: { cards: cards.length, aliases: cards.filter((c) => c.alias).length, banlists: bl.banlists.length, archetypes: arch.list.length },
      banlists: bl.meta,
      notes: ['GENESYS: pointsCap non impostato (tetto non verificato)', 'archetypes: solo nomi EN (nessuna fonte IT)'],
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + '\n')
    // rimuove i file generati di versioni precedenti
    const keep = new Set([...Object.values(names), 'manifest.json'])
    for (const f of await readdir(OUT)) {
      if (/^(cards|banlists|archetypes|texts\.(en|it))\..+\.json$/.test(f) && !keep.has(f)) await rm(join(OUT, f))
    }
  }

  // ---------- report ----------
  log(unchanged ? `invariato (versione ${version})` : `scritto dataset ${version}`)
  for (const s of sizes) log(`  ${s.name.padEnd(36)} raw ${kb(s.raw).padStart(10)}  gzip ${kb(s.gzip).padStart(9)}`)
  log(`carte: ${cards.length} (alias/artwork ${cards.filter((c) => c.alias).length}; Extra Deck ${cards.filter((c) => c.isExtra).length}; con punti Genesys ${cards.filter((c) => c.genesys).length})`)
  log(`  Skill Card escluse: ${stats.skillExcluded}; derivate da YGOPRODeck (assenti da ogni cdb): ${stats.derivedFromYgo.length}`)
  log(`  alias dal cdb: ${stats.extraAlias}, sintetizzati da card_images: ${stats.synthAlias}, basi aggiunte per chiusura: ${stats.closure}, artwork YGOPRODeck che il cdb tratta come base indipendente (alias 0): ${stats.aliasFromImagesOnly}`)
  log(`  senza nome IT nel dump: ${stats.itMissing}; name_en != nome EN: ${stats.itNameMismatch}; nomi con entità HTML: ${stats.htmlEntityNames}`)
  log(`  alias con base assente dal dataset: ${stats.orphanAliases.length}`, stats.orphanAliases.slice(0, 5).join(' | '))
  const fromOther = [...cdb.keys()].filter((id) => origin.get(id) !== 'cards' && cards.some((c) => c.id === id)).length
  log(`  carte lette da release/prerelease anziché cards.cdb: ${fromOther}`)
  log(`banlist: ${bl.banlists.length} (OCG ${bl.banlists.filter((b) => b.format === 'OCG').length}, TCG ${bl.banlists.filter((b) => b.format === 'TCG').length}, GENESYS 1)`)
  log(`  testate ignorate (nome != OCG/TCG): ${[...bl.skippedNames].map(([k, v]) => `${k}x${v}`).join(', ') || 'nessuna'}`)
  log(`  testate duplicate in commit diversi (vince la più recente): ${bl.duplicates.length}`, bl.duplicates.slice(0, 6).join('; '))
  log(`  id di testata normalizzati (mese a 2 cifre): ${[...bl.normalizedIds].join(', ') || 'nessuno'}`)
  log(`  passcode in banlist assenti dal dataset: ${bl.unknownIds.size}`, [...bl.unknownIds].slice(0, 6).map(([k, v]) => `${k}@${v.length}`).join(' '))
  log(`  passcode di banlist che sono alias (riportati alla base): ${bl.aliasHits.size}`)
  log(`archetipi: ${arch.list.length} (setcode usati dalle carte senza nome: ${arch.unnamed.length})`)
  for (const w of warnings) log('WARN', w)
  void stat
}

main().catch((e) => { console.error(e); process.exit(1) })
