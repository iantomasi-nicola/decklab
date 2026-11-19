import { test } from '@playwright/test'
import { prepare, seedLong } from '/home/user/decklab/tests/e2e/helpers/long'

test('profilo play', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page, 'dark', 'en')
  await page.setViewportSize({ width: 375, height: 800 })
  const id = await seedLong(page, 120)
  await page.goto(`/combo/${id}/replay`)
  await page.waitForSelector('[data-field]')
  await page.waitForTimeout(800)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')
  for (let i = 0; i < 25; i++) {
    await page.getByTestId('rp-next').click()
    await page.waitForTimeout(80)
  }
  const { profile } = await cdp.send('Profiler.stop')
  const self = new Map<string, number>()
  const nodes = new Map(profile.nodes.map((n: any) => [n.id, n]))
  const dt = profile.timeDeltas
  profile.samples.forEach((id: number, i: number) => {
    const n: any = nodes.get(id)
    const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0))
  })
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  for (const [k, v] of top) console.log((v / 1000).toFixed(1).padStart(8), 'ms', k)
})
