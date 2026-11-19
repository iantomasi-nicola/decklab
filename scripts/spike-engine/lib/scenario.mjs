// Test decklists (by English name), resolved through cards.cdb.
export const SKY = {
  main: [['Sky Striker Ace - Kagari', 3], ['Sky Striker Ace - Shizuku', 3], ['Sky Striker Mobilize - Engage!', 3], ['Sky Striker Mecha - Hornet Drones', 3], ['Sky Striker Mecha - Widow Anchor', 2], ['Sky Striker Mecha Modules - Multirole', 3], ['Sky Striker Maneuver - Afterburners!', 2], ['Sky Striker Maneuver - Scissors Cross', 1], ['Sky Striker Maneuver - Vector Blast', 1], ['Sky Striker Mecha - Eagle Booster', 1], ['Ash Blossom & Joyous Spring', 3], ['Pot of Desires', 3], ['Foolish Burial', 1], ['Raigeki', 1]],
  extra: [['Sky Striker Ace - Hayate', 1], ['Sky Striker Ace - Raye', 1], ['Sky Striker Ace - Zeke', 1], ['Sky Striker Ace - Camellia', 1], ['Sky Striker Ace - Azalea', 1]],
}
// ~10 distinct-card mini deck (step 1 of the brief)
export const MINI = { main: [['Sky Striker Ace - Kagari', 4], ['Sky Striker Mobilize - Engage!', 4], ['Sky Striker Mecha - Hornet Drones', 4], ['Sky Striker Mecha Modules - Multirole', 4], ['Sky Striker Ace - Shizuku', 4], ['Sky Striker Maneuver - Afterburners!', 4], ['Ash Blossom & Joyous Spring', 4], ['Pot of Desires', 4], ['Foolish Burial', 4], ['Raigeki', 4]], extra: [['Sky Striker Ace - Hayate', 1]] }
// Opponent: vanilla monsters (no scripts needed)
export const OPP = { main: [['Dark Magician', 20], ['Blue-Eyes White Dragon', 20]], extra: [] }
export function resolve(cdb, list) {
  const out = []
  for (const [n, k] of list) { const id = cdb.byName(n); if (!id) throw new Error('card not found: ' + n); for (let i = 0; i < k; i++) out.push(id) }
  return out
}
export function resolveDecks(cdb, d, o = OPP) { return { main: resolve(cdb, d.main), extra: resolve(cdb, d.extra), opp: resolve(cdb, o.main), oppExtra: [] } }
