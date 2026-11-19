// Test decklists (by English name), resolved through cards.cdb.
export const SKY = {
  main: [['Sky Striker Ace - Raye', 3], ['Sky Striker Mobilize - Engage!', 3], ['Sky Striker Mecha - Hornet Drones', 3], ['Sky Striker Mecha - Widow Anchor', 2], ['Sky Striker Mecha Modules - Multirole', 3], ['Sky Striker Maneuver - Afterburners!', 2], ['Sky Striker Maneuver - Scissors Cross', 1], ['Sky Striker Maneuver - Vector Blast', 1], ['Sky Striker Mecha - Eagle Booster', 1], ['Ash Blossom & Joyous Spring', 3], ['Pot of Desires', 3], ['Foolish Burial', 1], ['Raigeki', 1]],
  extra: [['Sky Striker Ace - Kagari', 1], ['Sky Striker Ace - Shizuku', 1], ['Sky Striker Ace - Hayate', 1], ['Sky Striker Ace - Zeke', 1], ['Sky Striker Ace - Camellia', 1], ['Sky Striker Ace - Azalea', 1]],
}
// ~10 distinct-card mini deck (step 1 of the brief)
export const MINI = { main: [['Sky Striker Ace - Raye', 4], ['Sky Striker Mobilize - Engage!', 4], ['Sky Striker Mecha - Hornet Drones', 4], ['Sky Striker Mecha Modules - Multirole', 4], ['Sky Striker Maneuver - Afterburners!', 4], ['Ash Blossom & Joyous Spring', 4], ['Pot of Desires', 4], ['Foolish Burial', 4], ['Raigeki', 4], ['Sky Striker Mecha - Widow Anchor', 4]], extra: [['Sky Striker Ace - Hayate', 1], ['Sky Striker Ace - Kagari', 1]] }
// Opponent: vanilla monsters (no scripts needed)
export const OPP = { main: [['Dark Magician', 20], ['Blue-Eyes White Dragon', 20]], extra: [] }
export function resolve(cdb, list) {
  const out = []
  for (const [n, k] of list) { const id = cdb.byName(n); if (!id) throw new Error('card not found: ' + n); for (let i = 0; i < k; i++) out.push(id) }
  return out
}
// The core does NOT shuffle at duel start (verified): the app must order the decks itself. Seeded Fisher-Yates.
export function seededShuffle(list, seed) { const a = [...list]; let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
export function resolveDecks(cdb, d, o = OPP, orderSeed = 12345) { return { main: seededShuffle(resolve(cdb, d.main), orderSeed), extra: resolve(cdb, d.extra), opp: seededShuffle(resolve(cdb, o.main), orderSeed + 1), oppExtra: [] } }
