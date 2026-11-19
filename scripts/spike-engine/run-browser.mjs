import { chromium } from 'playwright'
const mode = process.argv[2] ?? 'local' // local mirror | raw (raw.githubusercontent via proxy)
const variant = process.argv[4] ?? 'inline'
import { execSync } from 'node:child_process'
const rss = () => Math.round(+execSync("ps -eo rss,args | grep -i '[g]oogle-chrome\\|[c]hrome' | awk '{s+=$1} END {print s}'").toString() / 1024)
const extra = (process.argv[3] ?? '').split(' ').filter(Boolean)
const proxy = process.env.HTTPS_PROXY
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: extra, headless: true, ...(mode === 'raw' && proxy ? { proxy: { server: proxy } } : {}) })
console.log('chrome', browser.version(), 'flags', extra.join(' '))
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })
const sizes = []
page.on('response', (r) => { if (r.url().endsWith('.wasm')) sizes.push([r.url().split('/').pop(), r.headers()['content-length']]) })
await page.goto('http://localhost:8765/'); await page.waitForFunction(() => window.ready)
const scriptsBase = mode === 'raw' ? 'https://raw.githubusercontent.com/ProjectIgnis/CardScripts/5b613bfc3c122f48238e32f85015b32892577a42/' : 'http://localhost:8765/cs/'
const rss0 = rss()
const res = await page.evaluate((o) => window.runSpike(o), { scriptsBase, maxNew: 60, deck: 'sky', variant, noJspi: process.env.NOJSPI === '1' })
res.chromeRssMB = { blank: rss0, afterRun: rss() }; await page.evaluate(() => window.stopSpike())
delete res.firstDuel?.log; console.log(JSON.stringify(res)); console.log('wasm requests', JSON.stringify(sizes))
await browser.close()
