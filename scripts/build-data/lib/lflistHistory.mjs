// Ricostruzione delle banlist storiche dalla cronologia git di ProjectIgnis/LFLists.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const REPO = 'https://github.com/ProjectIgnis/LFLists.git'
const git = (cwd, args, opts = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts })

/** Clona (blobless) o aggiorna il repository e restituisce l'hash di HEAD. */
export function syncRepo(dir) {
  if (existsSync(dir)) git(dir, ['fetch', '--quiet', 'origin', '+HEAD:refs/remotes/origin/HEAD'])
  else git('.', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', REPO, dir])
  return git(dir, ['rev-parse', 'origin/HEAD']).trim()
}

/**
 * Per ogni commit che ha toccato `file` (seguendo i rename) dal più vecchio al più recente:
 * { commit, date, path, text }.
 */
export function fileVersions(dir, file, head) {
  const log = git(dir, ['log', '--follow', '--format=C %H %cs', '--name-only', head, '--', file])
  const out = []
  let cur = null
  for (const line of log.split('\n')) {
    if (line.startsWith('C ')) {
      const [, commit, date] = line.split(' ')
      cur = { commit, date, path: null }
      out.push(cur)
    } else if (line.trim() && cur && !cur.path) cur.path = line.trim()
  }
  out.reverse() // --follow non funziona con --reverse: invertiamo qui (dal più vecchio al più recente)
  for (const v of out) {
    try { v.text = git(dir, ['show', `${v.commit}:${v.path}`]) } catch { v.text = null } // commit che cancella il file
  }
  return out.filter((v) => v.text !== null)
}
