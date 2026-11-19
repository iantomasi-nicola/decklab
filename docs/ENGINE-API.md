# Motore EDOPro — API per la UI (fase 5)

Contratto stabile tra il motore (`src/engine/`, `src/workers/engine.worker.ts`) e l'interfaccia. Esito dello spike e scelte di piano: `SPIKE-ENGINE.md`; architettura: `ARCHITECTURE.md` §6. Se un tipo qui sotto cambia, va comunicato a chi costruisce la UI.

## Modello

`duello = seed + setup + [risposte]`. Il core (`@n1xx1/ocgcore-wasm` 0.1.6, build sync) gira in un Web Worker modulo; la UI non importa mai il core, solo tipi e funzioni pure (`protocol.ts`, `requests.ts`, `answers.ts`, `codec.ts`).

- **Risposte** = quelle del giocatore + quelle **automatiche** (politica, vedi sotto) registrate con flag `auto`. I replay non dipendono dalle impostazioni. L'avversario risponde in modo automatico e deterministico (passa) e non viene registrato.
- **Undo/redo illimitati**: spostano un indice nella cronologia **saltando le risposte automatiche**; lo stato mostrato viene dal log dei messaggi (nessun core). Il core si ricrea (25-40 ms) solo alla `respond` successiva. Una risposta diversa dopo un annulla tronca il "ripeti"; una risposta uguale alla annullata equivale a `redo`.
- **Mancano script?** Il worker li scarica (8 in parallelo) e rigioca da capo, senza che la UI se ne accorga (`DuelState.replays > 0`, evento `replaying`).
- **Mano e mazzo** sono decisi da noi: `shuffleDeck(seed)` (mulberry32) o `deckOrder` esplicito; `setup.hand.required` in cima; il core non mescola all'avvio.

## Client (`src/engine/client.ts`)

```ts
const engine = createEngineClient()              // crea il Worker
await engine.init({ wasmUrl?, dataBaseUrl?, scriptsBaseUrl? })  // wasm cache-first, dataset da /data/
let st = await engine.startDuel({ deck:{main,extra}, cards, setup, seed, deckOrder?, auto? })
st = await engine.respond(answerIdle('summon', opt.index))
st = await engine.undo(); st = await engine.redo()
const snap = await engine.snapshot()             // risposte+flag auto+log messaggi+piles
const block = await engine.engineBlock()         // ComboDoc['engine'] (core, scriptsCommit, seed+ordine mazzo, responses)
await engine.replay(answers, auto?)              // ricrea e rigioca (apertura di un combo salvato)
await engine.preload(codes)                      // scarica gli script in anticipo
engine.onEvent(e => …)                           // {event:'scripts',done,total} | {event:'replaying',reason:'missing-scripts',missing}
engine.terminate(); await engine.dispose()
```
Errori: `EngineClientError.code` = `'invalid-answer' | 'no-duel' | 'script-fetch' | 'core' | 'bad-request' | 'worker'`. Una risposta non valida **non** cambia lo stato.

### `StartDuelRequest`
| campo | note |
|---|---|
| `deck.main/extra` | passcode; l'indice nella lista identifica la copia fisica (per `deckOrder`) |
| `cards` | `combo.cards` (uid → passcode): necessario per `setup.hand.required` e per le carte di `setup.own/opponent` |
| `setup` | `combo.setup`. `hand.required` in cima; `fill:'none'` = solo le richieste; `own.places` = carte tolte dal mazzo e messe in campo; `opponent.board` = carte avversarie (uid `o*`) e LP. `first:false` = giochi per secondo: l'avversario (team 0) apre, passa, tu peschi al turno 2 |
| `seed` | numero: governa mescolata e (derivato) il seed del core |
| `deckOrder?` | permutazione degli indici di `deck.main`, 0 = cima |
| `auto?` | `{ pause:'always'\|'ifCanRespond'\|'never', single:boolean, sort:boolean }`, default `ifCanRespond`/`true`/`true`. `pause` governa le finestre `SELECT_CHAIN` facoltative: sempre chiedi / solo se hai effetti attivabili / mai (passa); `single` risolve da solo le scelte uniche (carte obbligate, una sola zona/posizione/opzione/dichiarazione); `sort` accetta l'ordine proposto. IDLECMD, BATTLECMD, sì/no e scelte con alternative restano sempre alla UI |

### `DuelState` (restituito da ogni operazione)
`pending: PendingRequest | null` · `delta` (messaggi grezzi dell'ultima operazione, per animazioni) · `position`/`total` (risposte applicate/totali, automatiche incluse) · `autoApplied` (risposte automatiche dell'ultima operazione) · `canUndo`/`canRedo` · `ended` · `steps: Step[]` (formato combo) · `cards` (uid → passcode, **tutte** le carte fisiche: per il combo salvato tenere solo gli uid citati) · `requiredHand` (da salvare in `setup.hand.required`) · `endboard` (campo) · `lp: [utente, avversario]` · `piles` · `replays` · `errors` (log Lua).

**`piles: [PlayerPiles, PlayerPiles]`** (indice 0 = utente, 1 = avversario): `{ hand, gy, banished, extra: CardRef[]; deckCount; handCount }`. `hand` nell'ordine reale; `gy`/`banished`: l'ultima è la cima; `CardRef.place.seq` = indice nella pila; carte coperte/riempitivo dell'avversario: `code` 0. Gli **uid sono stabili** tra le posizioni (assegnati a tutte le carte fisiche all'inizio): usarli come chiave.

## Richieste (`PendingRequest`, `src/engine/requests.ts`)

`CardRef = { uid, code, place: Place }` (Place del formato combo); `Opt = CardRef & { index }` dove **`index` è l'indice nell'elenco originale del core** e va rimesso nella risposta. `desc: DescRef | null` = `{kind:'card', code, index}` (stringa `str<index+1>` della carta) oppure `{kind:'system', id}` (strings.conf); 0 → `null`.

| `kind` | contenuto | costruttore di risposta (`answers.ts`) |
|---|---|---|
| `idle` | `summons, specialSummons, posChanges, monsterSets, spellSets: Opt[]`, `activates: (Opt&{desc})[]`, `canBattle, canEndTurn, canShuffle` | `answerIdle(action, index?)` con action `summon\|specialSummon\|posChange\|monsterSet\|spellSet\|activate\|toBattle\|toEnd\|shuffle` |
| `battle` | `attacks: (Opt&{canDirect})[]`, `chains`, `canMain2`, `canEnd` | `answerBattle('attack'\|'chain'\|'toMain2'\|'toEnd', index?)` |
| `chain` | `forced`, `options: (Opt&{desc})[]` (vuoto = finestra senza effetti), `hintTiming` | `answerChain(index \| null)` (null = passa) |
| `effectYn` | `card: CardRef`, `desc` | `answerEffectYn(yes)` |
| `yesNo` | `desc` | `answerYesNo(yes)` |
| `option` | `options: (DescRef\|null)[]` | `answerOption(index)` |
| `cards` | `mode:'select'\|'tribute'`, `min, max, canCancel`, `options: (Opt&{tribute?})[]` | `answerCards(req, indices \| null)` |
| `unselect` | `min, max, canFinish, canCancel`, `selectable`, `selected` | `answerUnselect(index \| null)` (una carta alla volta; null = fine/annulla) |
| `sum` | `amount, exact, min, max, mustSelect, options` (con `value`) | `answerSum(indices)` |
| `counter` | `counterType, count, options: (Opt&{available})[]` | `answerCounter(counts[])` |
| `place` | `mode:'place'\|'disfield'`, `count`, `available: PlaceOpt[]` (zone **libere**, `p`, `loc`, `seq`) | `answerPlace(req, places)` |
| `position` | `code`, `positions: Position[]` | `answerPosition(pos)` |
| `sort` | `mode:'card'\|'chain'`, `cards` | `answerSort(order \| null)` |
| `announceRace` / `announceAttribute` | `count`, `available: number[]` (bit singoli) | `answerRace(bits[])` / `answerAttribute(bits[])` |
| `announceNumber` | `options: number[]` | `answerNumber(n)` |
| `announceCard` | `candidates: number[]` (passcode filtrati dal worker, max 4000), `truncated` | `answerCard(code)` |
| `rps` | — | `answerRps(1\|2\|3)` |

Le risposte sono oggetti `OcgResponse` del pacchetto (possono contenere `bigint`): vanno bene per `postMessage`; per salvarle usare `codec.ts` (`encodeEntries/decodeEntries`: base64 di JSON, prefisso `a.` per le automatiche) — è il formato di `combo.engine.responses`.

## Normalizzatore (`src/engine/normalize.ts`)

Funzione pura (piano, log, risposte) → `Step[]` + `cards` + `requiredHand` + `endboard` + `piles`. Un passo = una scelta di menu del giocatore (IDLECMD, BATTLECMD, effetto scelto in SELECT_CHAIN); le scelte intermedie (carte, zone, posizione) si fondono nel passo; i movimenti della risoluzione di una catena vanno nel passo del loro anello (`CHAIN_SOLVING n`).

| Messaggio/risposta | Step |
|---|---|
| IDLECMD summon / flip / set / posChange | `normalSummon` (`tributeSummon` se c'è `SELECT_TRIBUTE`), `flipSummon`, `setMonster`, `setSpellTrap`, `changePosition` |
| IDLECMD special summon | `specialSummon` + `method` (`fusion/synchro/xyz/link/ritual` dal tipo; `procedure` se non dall'Extra) |
| IDLECMD/BATTLECMD/CHAIN activate | `activate` (`chainActivate` se la catena è aperta) + `effect:{kind, index}` (`activation` per S/T, `ignition`, `quick`/`trigger` dalla finestra) + `chain:{id,link}` |
| TO_BP / TO_EP / TO_M2, SHUFFLE | `enterPhase` (`phase`), `shuffle` |
| BATTLECMD attack + ATTACK | `attack` + `targets` |
| `MOVE` / `DRAW` | `moves` (`why`: summon, set, flip, tribute, material, cost, search, draw, discard, send, banish, return, other) e `searched`; `from` solo alla prima mossa di una carta nel passo e solo se la carta è già "nota" al documento |
| materiali Xyz | `to:{loc:'overlay', host, seq}`; Synchro/Link/Fusione/Rituale: `why:'material'` verso GY/bandite |
| `POS_CHANGE` | mossa `why:'position'` |
| `BECOME_TARGET`, `CARD_TARGET`, `EQUIP` | `targets` |
| `LPUPDATE`, `DAMAGE`, `RECOVER`, `PAY_LPCOST` | `lp:[{p,delta}]` |
| `ADD_COUNTER` / `REMOVE_COUNTER` | `counters:[{uid,type:'0x…',delta}]` |
| `NEW_PHASE` | `phase` dei passi successivi |
| `SHUFFLE_HAND` | riordina la mano tracciata (per passcode) |
| `HINT`, `CONFIRM_*`, `SHUFFLE_DECK`, … | ignorati dai passi |

**Limiti noti** (il messaggio non porta l'informazione): `MOVE` non ha il motivo, quindi *distruzione* e *invio al GY* non si distinguono (`why:'send'`); costi e materiali si deducono dal contesto; dopo `SHUFFLE_DECK` le carte del mazzo si abbinano per passcode (copie intercambiabili); i token che lasciano il campo diventano una mossa verso il GY; il riempitivo dell'avversario non compare mai in `cards`/`steps`; i materiali Xyz iniziali in `setup.own` non sono supportati; l'avversario non ha IA (passa sempre; "interrupts" dichiarativi → fase 6).

## Script e cache

- Sorgente: `https://raw.githubusercontent.com/ProjectIgnis/CardScripts/<SCRIPTS_COMMIT>/` (commit fissato in `constants.ts`, salvato in `engine.scriptsCommit`). jsDelivr **non** va usato (403 sul 16% dei file).
- 25 file di base + `official/c<id>.lua` per mazzo, extra e carte del setup: un unico precarico, 8 richieste in parallelo.
- Cache Storage `combolab-scripts-<sha12>` (i 404 sono salvati come marcatori: cache negativa persistente; un commit nuovo = cache nuova, le vecchie si potano). Errori transitori (403/429/5xx) **non** entrano nella cache negativa.
- Wasm: `fetch` dell'asset di build `ocgcore.sync-<hash>.wasm`, cache-first in `combolab-engine-wasm-v1`; il chunk base64 (1,28 MB) e i chunk JSPI non si scaricano mai e sono fuori dalla precache PWA (`globIgnores`, route cache-first del glue JS in `sw.ts`).

## Test

`tests/engine/engine.test.ts` (Vitest, Node, core reale): servono gli script al commit fissato; si scaricano una volta in `.cache/engine-scripts/` (dietro proxy: `NODE_USE_ENV_PROXY=1`); senza rete né cache i test si saltano. Coprono mano/ordine/seed, determinismo tra istanze, undo/redo, politica automatica, "rigioca da capo", cache negativa, Xyz, Synchro, Link, catene, primo/secondo, board avversario; i doc risultanti passano `validateCombo` senza errori né avvisi.
