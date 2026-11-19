/** Costanti del motore EDOPro (fase 5). Spike: docs/SPIKE-ENGINE.md. */

/** Commit fissato di ProjectIgnis/CardScripts: finisce in `combo.engine.scriptsCommit` e nel nome della cache. */
export const SCRIPTS_COMMIT = '5b613bfc3c122f48238e32f85015b32892577a42'
/** Sorgente primaria. jsDelivr risponde 403 su ~16% dei file con il commit fissato (vedi SPIKE-ENGINE.md): non usarlo. */
export const SCRIPTS_BASE_URL = `https://raw.githubusercontent.com/ProjectIgnis/CardScripts/${SCRIPTS_COMMIT}/`
/** Valore di `combo.engine.core`. */
export const CORE_ID = '@n1xx1/ocgcore-wasm@0.1.6'
/** Versione dell'API del core (`getVersion()`), salvata per diagnosticare un replay non più valido. */
export const CORE_API: readonly [number, number] = [11, 0]
/** Valore di `combo.engine.mode`. */
export const ENGINE_MODE = 'MR5'

/** Richieste HTTP in parallelo verso gli script. */
export const SCRIPT_CONCURRENCY = 8
/** Cache Storage degli script: il commit è nel nome, un nuovo commit = nuova cache (le vecchie si potano). */
export const SCRIPTS_CACHE_PREFIX = 'combolab-scripts-'
export const SCRIPTS_CACHE_NAME = `${SCRIPTS_CACHE_PREFIX}${SCRIPTS_COMMIT.slice(0, 12)}`
/** Cache Storage del binario wasm (cache-first; l'URL ha già l'hash di contenuto nel nome). */
export const WASM_CACHE_NAME = 'combolab-engine-wasm-v1'

/** I 25 file di base che il core richiede sempre (stessi per ogni duello a questo commit). */
export const BASE_SCRIPT_FILES: readonly string[] = [
  'constant.lua', 'utility.lua', 'debug_utility.lua', 'card_counter_constants.lua', 'archetype_setcode_constants.lua',
  'chain.lua', 'cards_specific_functions.lua', 'deprecated_functions.lua',
  'proc_equip.lua', 'proc_fusion.lua', 'proc_fusion_spell.lua', 'proc_gemini.lua', 'proc_link.lua', 'proc_maximum.lua',
  'proc_normal.lua', 'proc_pendulum.lua', 'proc_persistent.lua', 'proc_ritual.lua', 'proc_rush.lua', 'proc_skill.lua',
  'proc_spirit.lua', 'proc_synchro.lua', 'proc_union.lua', 'proc_workaround.lua', 'proc_xyz.lua',
]
/** Caricati con `loadScript` prima di aggiungere le carte (nell'ordine in cui il core si aspetta). */
export const PRELOADED_SCRIPTS: readonly string[] = ['constant.lua', 'utility.lua']
/** Noti come inesistenti a questo commit: non vengono nemmeno richiesti (evita una passata "rigioca da capo"). */
export const KNOWN_ABSENT_SCRIPTS: readonly string[] = ['proc_unofficial.lua', 'official/c0.lua']
