# Spike motore EDOPro (fase 5) — esito

Data: 2026-11-19. Codice usa e getta in `scripts/spike-engine/` (non tocca `src/`).
Pacchetto: `@n1xx1/ocgcore-wasm` **0.1.6** (MIT), core `ygopro-core` di edo9300, versione API `[11, 0]`.
Script carte: `ProjectIgnis/CardScripts` commit fissato `5b613bfc3c122f48238e32f85015b32892577a42`.

## Conclusione

**Fattibile: sì**, con la build sync, in un Web Worker, senza JSPI. Tutti i criteri tecnici della fase 5 sono stati verificati su un duello reale (mazzo Sky Striker di 19 carte distinte, 200 risposte, 520 messaggi, 0 errori Lua). Quattro cose da cambiare nel piano (sezione "Raccomandazioni"): **sorgente degli script (jsDelivr non va)**, **mescolata del mazzo a carico nostro**, **caricamento del wasm come binario**, **import del pacchetto**.

## Come si installa

`npx jsr add @n1xx1/ocgcore-wasm` (dentro `scripts/spike-engine/`) imposta `.npmrc` e installa `@n1xx1/ocgcore-wasm@npm:@jsr/n1xx1__ocgcore-wasm@^0.1.6` dal registro npm di JSR (`npm.jsr.io`). Il pacchetto contiene `lib/ocgcore.sync.wasm`, `lib/ocgcore.jspi.wasm`, `dist/*.js` e le definizioni TS.

**Difetto del pacchetto**: `mod.js` fa solo `export * from "./dist/index.js"`, e `export *` non riesporta il `default`: `import createCore from "@n1xx1/ocgcore-wasm"` fallisce. La `exports` del package.json espone solo `.`. Soluzione usata: import relativo di `dist/index.js` (in Vite basta un `resolve.alias`; verificato che Vite 8 compila il worker così, `vite.spike.config.mjs`).

## Numeri

Misure in Chrome 153 headless (worker modulo) e Node 22 su una macchina molto carica (load average 16–24): i tempi sono quindi **limiti superiori**. **Non misurato su telefono reale** (il throttling CPU di Chrome non si applica ai worker); stima prudente 3–6x i valori sotto.

| Voce | Valore |
|---|---|
| `.wasm` sync, raw / gzip-9 / brotli-11 | 960.935 B / 332.616 B / 258.823 B (jspi: 961.684 B) |
| Caricamento di default | importa un chunk JS da **1,28 MB** (wasm in base64, 459 KB gzip) + glue da 21 KB |
| Caricamento con `createCore({sync:true, wasmBinary})` | scarica solo il `.wasm` (961 KB), evita il chunk da 1,28 MB, compilazione 5–17 ms |
| Avvio `createCore` (worker, a freddo) | 25–60 ms (Node: 20–55 ms) |
| Memoria lineare wasm | 16 MB fissi, invariata dopo 30 duelli consecutivi (nessuna perdita) |
| Creare un duello (19 carte distinte + ~45 script Lua + start) | ~25 ms (24–50 sotto carico) |
| Costo per risposta rigiocata | ~0,05 ms (200 risposte rigiocate: 30–50 ms totali) |
| **Annulla** (ricreare + rigiocare N risposte) | 25–40 ms, quasi indipendente da N (0→200 risposte) |
| 20 annulla + 20 ripeti consecutivi | 1,4–2,5 s totali (35–60 ms l'uno), stato finale identico |
| Thread principale mentre il motore gira nel worker | 0 long task |
| Sync senza JSPI | **sì**: rimuovendo `WebAssembly.Suspending/promising` il duello gira identico (Chrome 153 li ha di default) |
| Snapshot messaggi | 60 risposte = 16,6 KB JSON; le sole risposte = 1,8 KB |

### Script Lua (passo 3)

| Voce | Valore |
|---|---|
| File di base (`constant.lua`, `utility.lua`, `proc_*.lua`, …) | 25 file, 512 KB raw / 107 KB gzip, sempre gli stessi |
| Script di carta | mediana 2,2 KB, p99 4,9 KB, max 7,4 KB (13.542 file ufficiali, 29,2 MB raw, ~5,6 MB tar.gz) |
| Mazzo test (13 main + 6 extra distinti + 2 vanilla avversario) | 19 script = 39,7 KB raw / 7 KB gzip |
| Archetipo intero Sky Striker (21 carte con script) | 59 KB raw |
| **Totale per un archetipo** | ~550 KB raw, ~115 KB gzip, **44–49 richieste HTTP** |
| Tempo di scaricamento (8 in parallelo, raw.githubusercontent) | 0,5–0,9 s (Node), 0,55 s (browser) |
| Passate "rigioca da capo" | 3 (1: file di base mancanti; 2: `utility.lua` richiama `proc_*` e le carte; 3: pulita) |
| Carte citate a runtime e non nel mazzo | 0 nel test (token Sky Striker senza script: 404 normale) |
| Compat. su 400 carte casuali reali | 0 errori Lua/core caricando tutte insieme |

I 404 sono normali: carte vanilla/token non hanno script, `c0.lua` viene sempre richiesto, `proc_unofficial.lua` non esiste a questo commit. Serve una **cache negativa**.

### jsDelivr col commit fissato NON funziona (scoperta importante)

`cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@<sha>/…` risponde **403 "Package size exceeded the configured limit of 50 MB"** su **67 file su 404 campionati (16,6%)**, in modo deterministico (anche ritentando), compresi `proc_spirit.lua`, `proc_skill.lua`, `debug_utility.lua` e centinaia di carte reali. Il resto risponde 200, quindi la verifica fatta a mano su pochi file aveva dato "OK". `raw.githubusercontent.com/ProjectIgnis/CardScripts/<sha>/…` ha dato **200 su 404/404**, con `access-control-allow-origin: *` e `cache-control: max-age=300`, ed è anche più veloce (3 s contro 22 s per 404 file). Verificato dal browser (Chrome) e da Node.

### Determinismo (passo 4)

- Stesso seed + stesse risposte: messaggi identici **5/5** nella stessa istanza e **identici** in una seconda istanza del core.
- Seed del core diverso con le stesse risposte: lo stato diverge e il core risponde `RETRY` (risposta non più valida): va trattato come errore di replay.
- **Il core NON mescola il mazzo all'avvio**: con seed diversi la mano iniziale è identica (le carte restano nell'ordine in cui le aggiungiamo). Il seed governa solo le mescolate/casualità durante il duello. Quindi **l'ordine del mazzo e la mano iniziale sono un dato di setup che decidiamo noi** (mescolata con PRNG a seed nostro, oppure ordine scelto a mano nell'editor, utile per le combo). Il setup della combo deve salvare: seed del core, ordine dei mazzi, risposte.
- Il replay serve a ricostruire il core; per guida/replay/testo basta lo snapshot dei messaggi.

## Rischi

1. **Sorgente script** (alto, risolto con la scelta sotto): jsDelivr incompleto. `raw.githubusercontent.com` non ha SLA e può limitare la frequenza; un mirror nostro è più robusto ma ridistribuisce codice AGPL (§13 di ARCHITECTURE).
2. **Pacchetto con un solo manutentore**, versione 0.1.x, `default` non riesportato: fissare la versione e conservare il `.wasm` nel repo/cache.
3. **Telefono**: non misurato. Avvio e creazione duello vanno rimisurati su un dispositivo medio prima di costruire la UI di gioco (stima 0,2–0,4 s avvio, 75–150 ms per annulla).
4. **Coerenza core ↔ script**: il core è `[11, 0]` e gli script sono quelli di `master`; 400 carte casuali caricano senza errori, ma carte molto nuove possono richiedere un core più recente. Il commit degli script va salvato nella combo (già previsto) insieme alla versione del core.
5. **Testi**: i messaggi portano solo id (`description` = `codice<<4 | indice` per le stringhe di carta, id di sistema per `HINT`/`selectmsg`). Servono le stringhe delle carte (tabella `texts` del cdb, `str1..str16`) e `strings.conf` (già in `scripts/.cache`) per i testi localizzati.
6. **`jspi` chunk**: il bundle include anche i chunk JSPI da 1,28 MB, mai usati: escluderli dalla precache PWA.
7. **Politica di risposta del test**: l'agente del test sceglie sempre la prima opzione; non è un'IA e non valida la qualità delle combo, solo che il core non si blocca. Non sono stati esercitati tutti i tipi di richiesta (vedi tabella: ne sono comparsi 7 su 21).

## Raccomandazioni di piano (fase 5)

1. **Script da `raw.githubusercontent.com/…/<sha>/`** come sorgente primaria (jsDelivr solo come ripiego per i file che rispondono 200), cache negativa per i 404, Cache Storage con il commit nel nome. Aggiornare ARCHITECTURE §0/§6.2 (che dice "verificato" per jsDelivr) e il rischio R5 della roadmap.
2. **Precarico statico**: la lista dei 25 file di base è fissa per commit; precaricarla con le carte del mazzo/extra/avversario in un'unica ondata riduce le passate da 3 a 1 (le restanti restano "rigioca da capo" per carte citate a runtime).
3. **wasm come binario**: `fetch('ocgcore.sync.wasm')` (brotli ~259 KB) + `createCore({ sync: true, wasmBinary })`, cache-first. Non usare il chunk base64.
4. **Ordine del mazzo e mano iniziale in setup** (feature dell'editor: mano a scelta, mazzo mescolato da seed nostro); salvare seed del core + ordine + risposte.
5. **Annulla = ricreare + rigiocare** è economico (25–40 ms): niente snapshot di memoria del core, basta lo snapshot messaggi per la UI. Un solo duello vivo + uno in costruzione resta una regola prudente ma il costo di memoria osservato (16 MB) è basso.
6. **Aggiungere in fase 5 uno step di misura su telefono** (stesso `run-browser.mjs` servito sulla rete locale) prima della UI di gioco.
7. Riporre `scripts/spike-engine/` come riferimento: `lib/engine.mjs` (ciclo di processo + replay), `lib/scripts.mjs` (cache sync + rigioca) sono riusabili quasi tali e quali nel worker di produzione.

## Messaggi del core → componenti UI (fase 5)

Derivata da `OcgMessageType` e dalle interfacce `OcgMessage*` del pacchetto (94 tipi; script `gen-message-table.mjs`). **Richieste** = il core si ferma e attende un `OcgResponse` (21 tipi). Gli altri sono **eventi**: aggiornano lo stato/animazioni, non chiedono input. Visti nel test: R = comparsi in 200 risposte.

### Richieste (servono un componente ciascuna)

| Messaggio (R = visto) | Risposta | Componente UI |
|---|---|---|
| `SELECT_IDLECMD` (R) | `SELECT_IDLECMD {action, index}` | **Board interattivo**: zone/carte evidenziate per azione legale; trascinamento = azione (evoca/SS/set/attiva); menu azioni sulla carta; pulsanti fase (BP/EP), mescola mano |
| `SELECT_BATTLECMD` | `SELECT_BATTLECMD` | Board: frecce di attacco, bersagli (diretto se `can_direct`), catene, M2/EP |
| `SELECT_CHAIN` (R) | `SELECT_CHAIN {index\|null}` | **Foglio catena**: effetti attivabili (`description`), "passa" (assente se `forced`); sorgente della pausa automatica (sempre / solo se posso / mai) |
| `SELECT_EFFECTYN` (R) | `SELECT_EFFECTYN {yes}` | Dialog Sì/No con carta + testo effetto |
| `SELECT_YESNO` (R) | `SELECT_YESNO {yes}` | Dialog Sì/No con testo |
| `SELECT_OPTION` | `SELECT_OPTION {index}` | Elenco di opzioni testuali |
| `SELECT_CARD` (R) | `SELECT_CARD {indicies\|null}` | **Selettore carte** (min/max, annulla se `can_cancel`), griglia/segnaposto sul campo |
| `SELECT_UNSELECT_CARD` (R) | `SELECT_UNSELECT_CARD {index\|null}` | Selettore carte iterativo (toggle una per volta, "fine" se `can_finish`) |
| `SELECT_TRIBUTE` | `SELECT_TRIBUTE` | Selettore carte con valore di tributo (`release_param`) |
| `SELECT_SUM` | `SELECT_SUM {indicies}` | Selettore a somma (obbligate + scelte, `amount`, totale corrente) |
| `SELECT_COUNTER` | `SELECT_COUNTER {counters}` | Distribuzione contatori fra carte |
| `SELECT_PLACE` (R) / `SELECT_DISFIELD` | `SELECT_PLACE` / `SELECT_DISFIELD {places}` | **Selettore zone** sul board (`field_mask` = zone non disponibili, `count`) |
| `SELECT_POSITION` | `SELECT_POSITION {position}` | Selettore posizione (carta ruotata ATK/DEF, scoperta/coperta) |
| `SORT_CARD` / `SORT_CHAIN` | `SORT_CARD {order\|null}` | Lista riordinabile (trascina), default automatico |
| `ANNOUNCE_RACE` / `ANNOUNCE_ATTRIB` | `ANNOUNCE_RACE {races}` / `ANNOUNCE_ATTRIB {attributes}` | Griglia di icone tipo/attributo (`available`, `count`) |
| `ANNOUNCE_NUMBER` | `ANNOUNCE_NUMBER {value}` | Selettore di numero da `options` |
| `ANNOUNCE_CARD` | `ANNOUNCE_CARD {card}` | **Ricerca carta** con filtro `opcodes` (il pacchetto esporta `cardMatchesOpcode`) |
| `ROCK_PAPER_SCISSORS` | `ROCK_PAPER_SCISSORS {value}` | Tre pulsanti (o automatico) |
| `RETRY` | (richiedere di nuovo) | Errore di replay/risposta non valida: ricostruire e segnalare |
| `REQUEST_DECK` / `WAITING` | — | Non usati dal nostro flusso (setup dei mazzi tramite `duelNewCard`) |

Altre risposte previste dal pacchetto senza messaggio dedicato: `SELECT_CARD_CODES` (selezione per codice).

### Eventi (animazioni, log, stato)

| Gruppo | Messaggi | Componente |
|---|---|---|
| Carte che si muovono | `MOVE` (R), `DRAW` (R), `POS_CHANGE` (R), `SET` (R), `SWAP`, `REMOVE_CARDS`, `EQUIP`, `FIELD_DISABLED`, `SWAP_GRAVE_DECK`, `SHUFFLE_SET_CARD` | Animazione carta + aggiornamento board (`duelQueryField`/`duelQueryLocation` per lo stato esatto) |
| Evocazioni | `SUMMONING`/`SUMMONED`, `SPSUMMONING`/`SPSUMMONED` (R), `FLIPSUMMONING`/`FLIPSUMMONED` | Banner "Evocazione", stato nel log |
| Catena | `CHAINING`, `CHAINED`, `CHAIN_SOLVING`, `CHAIN_SOLVED`, `CHAIN_END` (tutti R), `CHAIN_NEGATED`, `CHAIN_DISABLED`, `MISSED_EFFECT` | Pila di catena (lista numerata), evidenzia effetto in risoluzione |
| Bersagli/relazioni | `BECOME_TARGET` (R), `CARD_TARGET`, `CANCEL_TARGET`, `BE_CHAIN_TARGET`, `CARD_SELECTED`, `RANDOM_SELECTED`, `CREATE_RELATION`, `RELEASE_RELATION` | Frecce/evidenziazione bersaglio, nel log |
| Informazioni nascoste | `CONFIRM_CARDS` (R), `CONFIRM_DECKTOP`, `CONFIRM_EXTRATOP`, `DECK_TOP`, `REVERSE_DECK`, `SHUFFLE_DECK` (R), `SHUFFLE_HAND` (R), `SHUFFLE_EXTRA`, `REFRESH_DECK` | Pannello "carte mostrate" (modalità giocatore unico: mostrare sempre), animazione mescola |
| Fasi e turni | `NEW_TURN` (R), `NEW_PHASE` (R), `START`, `WIN`, `MATCH_KILL` | Barra fasi/turno, esito |
| Punti vita | `LPUPDATE`, `DAMAGE`, `RECOVER`, `PAY_LPCOST` | Contatore LP animato |
| Battaglia | `ATTACK`, `BATTLE`, `ATTACK_DISABLED`, `DAMAGE_STEP_START`, `DAMAGE_STEP_END` | Animazione attacco, log |
| Contatori | `ADD_COUNTER`, `REMOVE_COUNTER` | Badge contatore sulla carta |
| Casualità | `TOSS_COIN`, `TOSS_DICE`, `HAND_RES` | Toast con il risultato |
| Suggerimenti | `HINT` (R), `CARD_HINT` (R), `PLAYER_HINT`, `SHOW_HINT` | Testo guida sopra la richiesta (`selectmsg` = id di sistema da `strings.conf`) e badge effetti continui |
| Dati/stato | `UPDATE_DATA`, `UPDATE_CARD`, `RELOAD_FIELD`, `AI_NAME`, `TAG_SWAP`, `CUSTOM_MSG` | Sincronizzazione stato; `TAG_SWAP` e `AI_NAME` non usati |

Il **normalizzatore** verso gli `steps` del formato combo deve coprire in pratica: richieste (come azioni), `MOVE`/`SUMMON`/`CHAIN*`/`LP`, e ignorare gli eventi puramente cosmetici (`HINT`, `SHUFFLE_*`, `CONFIRM_*` solo come annotazioni).

## Riprodurre

```
cd scripts/spike-engine && npx jsr add @n1xx1/ocgcore-wasm   # già fatto, node_modules ignorato da git
export NODE_USE_ENV_PROXY=1
node --no-warnings run-node.mjs mini 10      # passo 1: ~10 risposte, tipi di messaggio
node --no-warnings run-node.mjs sky 200
node --no-warnings run-determinism.mjs       # passo 4
node --no-warnings run-scripts-weight.mjs <clone CardScripts>   # passo 3
node --no-warnings probe-jsdelivr.mjs <clone CardScripts>       # jsDelivr 403
CS_ROOT=<clone> node serve.mjs &             # poi: node run-browser.mjs local "" binary
```
