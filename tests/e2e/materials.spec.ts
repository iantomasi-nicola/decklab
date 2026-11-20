import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { openCombo, seedCombo } from './helpers/combo'
import { SCRIPTS_COMMIT } from '../../src/engine/constants'
import { decodeCards } from '../../src/domain/cards/cardsFormat'

const root = path.resolve(process.cwd())
const DIR = path.join(root, '.cache/engine-scripts', SCRIPTS_COMMIT.slice(0, 12))
const have = fs.existsSync(path.join(DIR, 'utility.lua'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/manifest.json'), 'utf8')) as { files: { cards: string } }
const cards = new Map(decodeCards(JSON.parse(fs.readFileSync(path.join(root, 'public/data', manifest.files.cards), 'utf8'))).map((c) => [c.id, c]))
const code = (name: string): number => {
  for (const c of cards.values()) if (c.name.en === name && c.alias === 0) return c.id
  throw new Error('carta non trovata: ' + name)
}
const times = (name: string, n: number) => Array.from({ length: n }, () => code(name))

async function serveScripts(page: Page) {
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.split(SCRIPTS_COMMIT + '/')[1] ?? ''
    const file = path.join(DIR, rel.replace(/\//g, '__'))
    if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/plain', body: fs.readFileSync(file, 'utf8'), headers: { 'access-control-allow-origin': '*' } })
    return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } })
  })
}
const FILL = [...times('Pot of Desires', 3), ...times('Dark Hole', 3), ...times('Foolish Burial', 3), ...times('Raigeki', 3)]
const pending = (page: Page) => page.evaluate(() => (window as unknown as { __duel: { getState(): { state: { pending: { kind: string } | null } | null } } }).__duel.getState().state?.pending?.kind ?? null)

test.skip(!have, 'cache degli script non presente')

test('REPRO Link: Extra -> materiali', async ({ page }) => {
  test.setTimeout(120_000)
  await serveScripts(page)
  const main = [...times('Gagaga Magician', 3), ...times('Wind-Up Soldier', 3), ...FILL]
  const extra = [code('Knightmare Phoenix'), code('Decode Talker'), code('Link Spider')]
  const id = await seedCombo(page, {
    cards: { u1: code('Gagaga Magician'), u2: code('Wind-Up Soldier'), u3: code('Gagaga Magician') },
    own: [
      { uid: 'u1', place: { loc: 'mzone', seq: 1, pos: 'FACEUP_ATK' } },
      { uid: 'u2', place: { loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } },
      { uid: 'u3', place: { loc: 'mzone', seq: 3, pos: 'FACEUP_ATK' } },
    ],
    deck: { main, extra },
  })
  const [w, h] = [Number(process.env.W ?? 375), Number(process.env.H ?? 800)]
  await page.setViewportSize({ width: w, height: h })
  await openCombo(page, id, 'it')
  await page.getByTestId('mode-auto').click()
  await page.getByTestId('start-panel').waitFor()
  await page.getByRole('radio', { name: 'A caso' }).click()
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `test-results/materials/repro-${w}-0-start.png` })
  // tocca l'Extra
  await page.locator('[data-pile-drag="extra"]').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `test-results/materials/repro-${w}-1-extra.png` })
  console.log('pending after extra tap', await pending(page))
  const info = await page.evaluate(async () => {
    const A = await import(/* @vite-ignore */ '/src/engine/answers.ts')
    const d = (window as unknown as { __duel: { getState(): { state: { pending: any } | null; respond(a: unknown): Promise<boolean> } } }).__duel.getState()
    const idle = d.state!.pending
    const lst = idle.specialSummons.map((o: any) => ({ index: o.index, code: o.code, loc: o.place.loc }))
    const out: unknown[] = [lst]
    for (const o of idle.specialSummons) {
      const st = (window as unknown as { __duel: { getState(): { state: { pending: any } | null; respond(a: unknown): Promise<boolean>; undo(): Promise<void> } } }).__duel.getState()
      await st.respond(A.answerIdle('specialSummon', o.index))
      const p2 = (window as unknown as { __duel: { getState(): { state: { pending: any } | null } } }).__duel.getState().state?.pending
      out.push({ code: o.code, kind: p2?.kind, min: p2?.min, max: p2?.max, canFinish: p2?.canFinish, canCancel: p2?.canCancel, sel: p2?.selectable?.map((x: any) => x.uid), n: p2?.options?.map((x: any) => x.uid) })
      await page_undo()
    }
    async function page_undo() { await (window as unknown as { __duel: { getState(): { undo(): Promise<void> } } }).__duel.getState().undo() }
    return out
  })
  console.log(JSON.stringify(info))
})
