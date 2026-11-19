# Combo Lab — Architettura

Stato: **bozza per approvazione** · Data: 2026-11-19 · Autore: Claude (sviluppatore senior + product designer)

Questo documento descrive *come* sarà costruita l'app. Il formato dei dati delle combo è in
[`COMBO_FORMAT.md`](COMBO_FORMAT.md), le fasi e i criteri di completamento in [`ROADMAP.md`](ROADMAP.md).

---

## 0. Esito della verifica delle fonti (eseguita il 2026-11-19)

Ho controllato con richieste reali, non a memoria. Le differenze rispetto al brief sono in **grassetto**.

| Fonte | Esito | Conseguenza |
|---|---|---|
| **`@n1xx1/ocgcore-wasm`** (JSR, v0.1.6, MIT, 0 dipendenze, "Node, Deno, Browser"; spike: il modulo `mod.js` non riesporta `createCore`, si importa da `dist/index.js`) | Esiste ed è mantenuto (pubblicato circa un mese fa). **È su JSR, non su npm**: si installa con `npx jsr add @n1xx1/ocgcore-wasm`. Ha una build **async (richiede JSPI)** e una build **sync** (`createCore({ sync: true })`). | Usiamo la **build sync**: non dipende da JSPI (Safari/Firefox stabili non sono garantiti), ed è coerente col nostro design (script precaricati, "manca uno script → rigioca da capo"). Vedi §6. |
| **jsDelivr** per CardScripts (`cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@<commit>/…`) | Verificato: `access-control-allow-origin: *`, cache 7 giorni. Limite documentato: 50 MB per pacchetto GitHub (non per file; i singoli script sono piccoli). | **Corretto dallo spike (2026-11-19)**: con commit fissato jsDelivr risponde **403 «package size > 50 MB»** per circa il **16% degli script** (67 su 400 campionati, in modo deterministico), perché il repository supera il limite. **Si usa `raw.githubusercontent.com/ProjectIgnis/CardScripts/<sha>/…`** (200 su 400/400, CORS `*`), sempre con commit fissato; jsDelivr solo come ripiego. Va ricontrollato il limite di richieste di raw.githubusercontent per i primi caricamenti (batch a bassa concorrenza + cache). |
| **raw.githubusercontent.com** | CORS `*`, cache 5 minuti. | Solo per file piccoli e per lo script di build. |
| **CardScripts** | Licenza **AGPL-3.0-or-later**, branch `master`, script `official/cNNNN.lua`, base in radice (`constant.lua`, `utility.lua`, `proc_*.lua`…). | Vedi §13 (licenze). |
| **BabelCDB** (`cards.cdb`, SQLite3) | Solo file `.cdb` in radice (`cards.cdb`, `cards-unofficial.cdb`, `prerelease-*.cdb`…). **Nessuna cartella di lingue**: i testi sono inglesi. | **I nomi italiani non vengono da BabelCDB**: servono da YGOPRODeck (sotto). |
| **YGOPRODeck API v7** | Limite **20 richieste/secondo** (superato = blocco di 1 ora). Parametro `language` **solo** su `cardinfo.php`, valori `fr`,`de`,`it`,`pt` (l'inglese è il default). Verificato: `language=it` restituisce nome e testo italiani **più `name_en`**; dump completo italiano ≈ **18 MB, 11.599 carte**. `misc=yes` include **`genesys_points`** (es. Ash Blossom = 18). `checkDBVer.php` restituisce `{"database_version":"147.89", …}` con CORS `*`. Risultati in cache 2 giorni. | Un **unico script di build** scarica EN+IT una volta e produce il nostro dataset compatto: nessun client chiama mai l'API delle carte. |
| **Immagini YGOPRODeck** | Hotlinking vietato; ogni immagine va scaricata **una sola volta** e ospitata da noi. Le immagini sono solo in inglese (vanno bene: l'illustrazione è uguale). | Pipeline immagini "scarica una volta" (§5). |
| **Campo `alias`** | **Non esiste nell'API YGOPRODeck.** Esiste nella tabella `datas` di `cards.cdb` (colonna `alias`), che è proprio la fonte giusta. YGOPRODeck ha `card_images[]` (artwork alternativi con id diverso) e `misc_info.treated_as`. | Gli artwork alternativi si ricondurranno alla carta base con `alias` di `cards.cdb`, incrociato con `card_images[]`. |
| **Banlist (LFLists di Project Ignis)** | File `OCG.lflist.conf`, **`0TCG.lflist.conf`** (il nome non è `TCG…`), `World`, `Traditional`, `Speed`, `GOAT`, `Rush`. Verificato: ognuno contiene **solo la lista corrente** (`!2026.10 OCG`). | Le **liste storiche** si ricavano dalla **cronologia git** del repository (script di build, offline). Le liste **Genesys non sono in LFLists**: i punti vengono da YGOPRODeck (`genesys_points`). Rischio descritto in §4. |
| **Mediabunny** (MPL-2.0, mantenuto) | Sostituisce `mp4-muxer`, che è **deprecato** dall'autore. MPL-2.0 = copyleft debole, ok per noi. | Usiamo **Mediabunny**. |
| **Supabase piano gratuito** (fonti terziarie, da ricontrollare sul sito all'iscrizione) | ~500 MB database, 1 GB storage, ~5 GB egress/mese, **pausa dopo 7 giorni di inattività**. | Local-first lo rende tollerabile; per le immagini proponiamo un'alternativa (§5, decisione D1). |
| **thedeckspace.com** | Il sito esiste ma il contenuto si carica dinamicamente: dal fetch vedo solo la navigazione (Deckspace, Public Deckspaces, Tutorial, Account, Suggestions). **Non riesco a vedere le sue statistiche.** | Vedi §11 e decisione D2: ho bisogno di una tua descrizione/screenshot. Comunque non copierei grafica o contenuti: rifaccio le *funzioni* in modo migliore. |

---

## 1. Principi guida e priorità

1. **Local-first**: la fonte di verità è IndexedDB sul dispositivo; il cloud è una replica.
2. **Un solo formato** (`COMBO_FORMAT`) per combo manuali, automatiche, replay, testo, video, Impara.
3. **Motore isolato in un Web Worker**; la UI non esegue mai logica pesante.
4. **Tutto ciò che è grande si carica on demand** (motore, video, editor, script Lua, immagini).
5. **Logica di dominio pura** (TypeScript senza React/DOM) → testabile con Vitest.
6. **Nessun testo hardcoded**: ogni stringa passa da i18n.

Non-obiettivi: multiutente/collaborazione, IA avversaria, matchmaking, negozio, prezzi.

---

## 2. Stack (verificato e motivato)

| Area | Scelta | Motivo / alternative |
|---|---|---|
| Build | **Vite + React + TypeScript strict** | Come da brief. Le versioni esatte si fissano in fase 2 (`npm view`). |
| Stile | **Tailwind CSS** + design token CSS (variabili) | Temi chiaro/scuro con variabili; zero librerie UI pesanti. Componenti propri + primitive accessibili headless (Radix UI) per dialog, menu, tooltip. |
| Stato | **Zustand** (UI) + **Dexie `liveQuery`** (dati) | I dati persistenti non vivono in Zustand, ma in IndexedDB; Zustand solo per stato di UI/sessione. |
| Routing | **TanStack Router** (o React Router) con route lazy | Code splitting per route. Scelta definitiva in fase 2. |
| i18n | **i18next** (o Lingui) con file JSON `it`/`en`, caricati on demand | Rilevamento da `navigator.language`, override nelle impostazioni. Test che fallisce se manca una chiave in una lingua. |
| DB locale | **Dexie** (IndexedDB) | Come da brief. |
| DB carte | Dataset **compatto JSON/binario indicizzato**, non SQLite | `sql.js` pesa >1 MB di wasm solo per leggere; per ricerca e legalità basta un array tipizzato + indice. Il `.cdb` SQLite serve **solo al motore** (§6) e viene generato a parte. Decisione definitiva dopo misura in fase 2. |
| Ricerca | **MiniSearch** (fuzzy, prefix) in worker, con normalizzazione (accenti, `&`, apostrofi) | Tollerante ai refusi IT/EN. Alternativa valutata: Fuse (più lento su 13k voci). |
| Sync | **Supabase** (Postgres + RLS + Realtime + Auth magic link/Google) | Come da brief. |
| PWA | **vite-plugin-pwa** (Workbox) | Precache dell'app shell; cache runtime per immagini e script; Web Share Target per `.ydk` e link. |
| Motore | **`@n1xx1/ocgcore-wasm`** build **sync**, in Web Worker | Vedi §6. |
| Video | **WebCodecs + Mediabunny**, fallback `MediaRecorder` | Vedi §9. |
| Link/QR | **fflate** (deflate) + base64url; **qrcode** (generazione) | Nessun server. |
| Grafici | SVG/Canvas propri sopra **d3-scale/d3-shape** (leggeri) | Niente librerie di grafici pesanti. |
| Test | **Vitest** (logica), **Playwright** (screenshot 375/768/1024/1440 × chiaro/scuro × IT/EN) | Come da brief; aggiungo controlli automatici di overflow orizzontale. |
| Hosting | **Cloudflare Pages** | Statico, gratuito, header controllabili. |

**Modifiche rispetto allo stack consigliato** (motivate): (1) build **sync** del core invece dell'async; (2) dataset compatto invece di `sql.js` sul client; (3) Mediabunny al posto di `mp4-muxer` (deprecato); (4) immagini su un bucket con egress gratuito (proposta D1).

---

## 3. Struttura del repository

```
docs/                    ARCHITECTURE, COMBO_FORMAT, ROADMAP, LICENSES, DECISIONS
schema/                  combo.v1.schema.json (generato dai tipi, vedi COMBO_FORMAT)
scripts/                 script di build dati (Node): carte, banlist, immagini, test del core
src/
  app/                   shell, routing, layout responsive, temi, PWA
  ui/                    design system (token, componenti, icone)
  i18n/                  it.json, en.json, loader
  domain/                LOGICA PURA (nessun React/DOM)
    cards/ deck/ legality/ combo/ format/ stats/ share/
  data/                  Dexie schema, repository, migrazioni, backup
  sync/                  outbox, pull/push, realtime, stato di sync
  features/
    archetypes/ decks/ combos/ guide/ replay/ learn/ stats-lab/ settings/
  workers/
    cards.worker.ts      ricerca, conversione dataset
    engine.worker.ts     ocgcore + risponditore dell'avversario
    export.worker.ts     rendering video
  engine/                protocollo UI⇄worker, mappa messaggi→richieste UI, normalizzatore passi
public/                  manifest, icone, dataset versionato
tests/                   unit, e2e, visual
```

Regola di dipendenza: `domain` non importa nulla di altro; `features` importano `domain`, `data`, `ui`; i `workers` importano solo `domain` e `engine`.

---

## 4. Dati delle carte e banlist

### 4.1 Pipeline di build (`scripts/build-data`, eseguita da me/da CI, non dal client)
1. `checkDBVer.php` → se la versione non è cambiata, stop.
2. Scarica **un** dump `cardinfo.php?misc=yes&format=genesys` in EN e **uno** con `&language=it` (≈18 MB ciascuno; due richieste in totale, ben sotto i 20 req/s).
3. Scarica `cards.cdb` da BabelCDB per `alias`, `setcode` (archetipi), `type`, `race`, `attribute`, `level/scale/link markers` (dati che il motore usa davvero).
4. Unisce per passcode e produce:
   - `cards.<ver>.bin|json`: campi leggeri per ricerca/legalità (id, alias, nomi EN/IT, tipo, attributo, livello, ATK/DEF, archetipi, punti Genesys, flag Extra Deck);
   - `texts.<lang>.<ver>.json`: testi degli effetti, caricati solo a richiesta (pagina carta);
   - `engine.<ver>.cdb`: SQLite minimale **solo per le carte che il motore deve leggere** (o intero, se il peso è accettabile).
5. Le versioni sono nel nome file (cache immutabile). Il client controlla un piccolo `manifest.json` all'avvio e si aggiorna in background.

### 4.2 Artwork alternativi
`alias` di `cards.cdb` ≠ 0 → la carta con quell'id è un artwork/ristampa di `alias`. La **chiave canonica** della carta è `canonicalId = alias || id`. Tutti i conteggi di legalità (max 3 copie, Limitate, ecc.) usano `canonicalId`. I passcode nei deck restano quelli scelti dall'utente (per mostrare l'artwork giusto), ma la normalizzazione avviene in `domain/cards`.

### 4.3 Banlist
- **Correnti**: `OCG.lflist.conf`, `0TCG.lflist.conf` (+ opzionali World/Traditional/Speed/GOAT) dal repository LFLists; formato `<passcode> <0|1|2> --nome` sotto una testata `!AAAA.MM NOME`.
- **Storiche**: lo script di build percorre la **cronologia git** dei file (`git log` su un clone locale, non API a raffica) e produce uno snapshot per ogni data distinta. *Rischio*: la cronologia potrebbe contenere commit intermedi non ufficiali; mitigazione: mantengo solo le testate `!AAAA.MM` distinte e ti mostro l'elenco per revisione in fase 2.
- **Genesys**: formato a punti con tetto (valore da verificare sulla regola ufficiale in fase 2, non lo assumo). I punti per carta vengono da `misc_info.genesys_points` (verificato presente). Se in futuro il campo sparisse, il formato Genesys si disattiva senza rompere il resto (feature flag).
- **Avviso nuova banlist** (richiesta tua): al caricamento di un nuovo snapshot, `domain/legality` ricalcola tutte le varianti e tutte le combo (le combo sono illegali se il loro `deck` o le carte usate lo sono) e mostra un riepilogo "cosa è diventato illegale" con link diretto.

### 4.4 Legalità (`domain/legality`, pura)
Input: `variant` (main/extra/side, regole, banlist scelta) → output: lista di `Issue` con `severity`, `cardCanonicalId`, `code` (i18n key) e parametri. Controlli: Proibita/Limitata/Semi-Limitata, max 3 per `canonicalId`, Main 40–60, Extra 0–15, Side 0–15, punti Genesys, carta non esistente in quel formato (TCG/OCG). Il banner riassume, la carta è evidenziata.

### 4.5 Aggiornamento
Aggiornamento dataset: cron GitHub Actions settimanale (o lancio manuale) → pubblica nuovi file su Cloudflare Pages. L'app mostra "nuove carte disponibili" e aggiorna in background; le combo salvate non si rompono perché usano passcode.

---

## 5. Immagini

- **Vincolo**: niente hotlink. Una Edge Function/Worker riceve `GET /img/{id}`: se non ce l'ha nel bucket, la scarica **una volta** da YGOPRODeck (rispettando coda e max pochi req/s), la salva e la serve con `Access-Control-Allow-Origin` (necessario per `canvas` e video senza "taint").
- **Caricamento pigro**: scarichiamo solo le immagini delle carte usate in deck/combo, non tutte le ~13.000 (che sarebbe sia inutile sia lesivo verso l'API). Un pulsante "precarica tutto il mio materiale" le scalda tutte.
- **Tre taglie**: `small` (lista/campo), `full` (dettaglio), `cropped` (opzionale per UI). Formato WebP quando disponibile.
- **Sul dispositivo**: Cache Storage, strategia cache-first con limite di dimensione e pulizia LRU.
- **Decisione D1 (ti chiedo conferma)**: Supabase Storage regge ~1 GB e 5 GB/mese di egress sul piano gratuito. **Cloudflare R2** (10 GB gratuiti, **egress a costo zero**) + un Worker è più adatto a ospitare immagini e vive già nello stesso ecosistema di Cloudflare Pages. Proposta: **R2 per le immagini, Supabase per dati e login**. Se preferisci un solo fornitore, Supabase Storage funziona comunque per un uso personale.

---

## 6. Motore EDOPro (fase 5–6)

### 6.1 Perché la build sync
`createCore({ sync: true })`: il core gira senza JSPI. Il ciclo è quello standard:
`createDuel → (carte iniziali) → startDuel → loop { duelProcess; duelGetMessage; se richiede risposta → duelSetResponse }`.
I callback `cardReader(code)` e `scriptReader(name)` sono **sincroni**: quindi gli script devono essere **già in memoria** prima di avviare. È esattamente il comportamento che vuoi (precarico, e se manca qualcosa rigioco da capo).

### 6.2 Precaricamento degli script
1. Da una combo si ricava l'insieme di carte coinvolte (deck + setup avversario).
2. Si scaricano (raw.githubusercontent.com con SHA fisso; jsDelivr non va bene, vedi §0) i file base (`constant.lua`, `utility.lua`, `proc_*.lua`, `cards_specific_functions.lua`, …) e `official/c<id>.lua` per ogni carta.
3. Si avvia il duello; se `scriptReader` incontra un nome non presente (carta evocata/cercata che non avevamo previsto, token, carta citata da un altro script) il worker **annota il nome mancante, interrompe, scarica, e rigioca da zero** `seed + setup + risposte` fino al punto corrente. L'utente vede al massimo un breve skeleton.
4. Gli script sono memorizzati in Cache Storage con il commit usato; il commit finisce in `engine.scriptsCommit` della combo.
5. Primo caricamento di un archetipo grande = molte richieste a jsDelivr: le raggruppiamo e le facciamo in parallelo a bassa concorrenza.

### 6.3 Determinismo, annulla/ripeti, replay
`partita = seed + setup + [risposte]`. Annullare = ricreare il duello e rigiocare le risposte meno l'ultima. Per fluidità si salva uno **snapshot dei messaggi** dopo ogni risposta (così il replay non richiede il core) e si ricostruisce il core solo quando si riprende a giocare. Se il motore o gli script sono cambiati rispetto alla combo salvata, il replay esatto non è garantito: la combo conserva comunque i `steps` normalizzati (indipendenti dal motore), quindi guida, testo, video e Impara funzionano sempre.

### 6.4 UI delle richieste
Mappa `OcgMessage*` → componente: selezione carte/zone, catena, posizione, somma di livelli, dichiarazioni (tipo/attributo/numero/carta), sì/no, ordinamento, opzione. Un componente per tipo, tutti ottimizzati per touch (bottom sheet su telefono, pannello laterale su tablet/PC). La mappa completa dei messaggi verrà derivata dalle definizioni TypeScript del pacchetto in fase 5, non scritta a memoria.

### 6.5 Catene e risoluzione automatica
Il worker contiene un **risponditore** a strati prima dell'interfaccia:
1. *Auto-risolve* richieste con una sola opzione valida.
2. *Salta* finestre di risposta senza azioni possibili (politica: sempre / solo se posso rispondere / mai).
3. *Avversario*: per ogni suo effetto rapido applica il comportamento scelto (Chiedimi / Auto alla prima occasione / Auto solo su carte scelte / Mai) e i bersagli (scelta manuale o lista di priorità). **Nessuna IA**: solo regole dichiarative.
4. Il resto va alla UI.

### 6.6 Avversario, board e "una volta per turno"
Setup dell'avversario tramite le API di setup del core (`Debug.AddCard`-equivalenti, posizione, zona, LP). *Effetti "una volta per turno" già usati*: tecnicamente possibile solo per effetti che usano contatori standard (`EFFECT_COUNT_LIMIT`); non esiste un meccanismo universale. **Limite che documenterò**: copertura parziale, da verificare con uno spike all'inizio della fase 6 prima di prometterlo; se non fattibile, l'utente imposta la board con gli effetti "freschi".

### 6.7 Primo/secondo, letale
Primo/secondo imposta l'ordine dei turni, il divieto di attacco/pescata del primo giocatore e i conteggi iniziali. Il **calcolo letale** (giocando secondo) usa il board finale e gli ATK/le possibilità di attacco calcolati dal motore o, se il motore non lo consente in modo affidabile, da un calcolo semplificato dichiarato come tale.

### 6.8 Rischi del motore (da chiudere con uno spike in fase 5)
- Dimensione del `.wasm` e tempo di avvio su telefono medio: lo misuro prima di scrivere UI.
- Memoria per duello multipli (annulla = ricreare): limitare a un duello vivo + uno in costruzione.
- Copertura script: le carte molto nuove possono non avere ancora lo script in `official/` → l'app segnala "carta non simulabile" e propone la modalità manuale.

---

## 7. Modello dati locale (Dexie) e remoto (Supabase)

Tabelle (tutte con `id` UUID, `updatedAt`, `deletedAt|null`, `userId`):

`archetypes`, `variants`, `decks` (se separati da `variants`; per default il deck vive nella variante), `combos`, `boards` (preset avversari), `tags`, `favorites`, `trainingStats`, `reviewQueue`, `settings`, `syncOutbox` (solo locale), `cacheMeta` (solo locale).

Relazioni: `archetype 1—N variant`, `variant 1—N combo` (con `variantId` nullo = combo "generale" dell'archetipo), `combo N—N tag`.

### Sync (local-first)
- **Scrittura**: ogni modifica scrive in Dexie e in `syncOutbox` in una sola transazione; la UI non aspetta mai la rete.
- **Push**: l'outbox viene svuotata a lotti (upsert idempotenti per `id`).
- **Pull**: per ogni tabella si chiede `updatedAt > cursor` (cursore salvato localmente) + canale **Realtime** per ricevere le modifiche degli altri dispositivi.
- **Conflitti**: last-write-wins **per entità** su `updatedAt`. Per evitare errori da orologi sfasati, `updatedAt` viene assegnato dal **server** al momento dell'upsert (colonna con trigger) e il client usa l'orario locale solo come valore provvisorio; le entità modificate offline vincono per l'ultimo che sincronizza. Compromesso accettabile per un solo utente; è documentato.
- **Cancellazioni**: soft (`deletedAt`), pulizia definitiva dopo N giorni.
- **Sicurezza**: ogni tabella ha `user_id uuid default auth.uid()` e RLS `using (user_id = auth.uid())` per select/insert/update/delete. Nessuna chiave di servizio nel client. Ti guiderò passo passo nella creazione del progetto Supabase (fase 2).
- **Stato**: indicatore discreto (sincronizzato / in corso / offline / errore con retry).
- **Single-user, ma auth reale**: il login serve a legare i dati ai dispositivi; magic link (nessuna password) e Google opzionale.
- **Pausa dopo 7 giorni** del piano gratuito: l'app continua a funzionare offline; alla riapertura riprende il sync. Un promemoria (o semplicemente aprire l'app ogni settimana) evita la pausa.

---

## 8. Combo, replay, guida (fasi 3, 6)

- `domain/combo` è il cuore: tipi del formato, validazione (JSON Schema/zod), migrazioni `v1→vN`, normalizzazione dei passi, conversione `steps → stato del campo` (riduttore puro `applyStep(state, step)`).
- **Replay** = riduttore applicato in sequenza + animazioni (transform/opacity, 150–250 ms ease-out, rispetta `prefers-reduced-motion`). Lo stato del campo a ogni passo si precalcola (snapshot) per avanti/indietro/salto istantanei.
- **Manuale**: nessuna regola; ogni azione è un passo annotabile; undo/redo = pila di comandi.
- **Automatica**: il normalizzatore trasforma i messaggi del core in `steps` ("evoca per Synchro", "attiva effetto", "cerca"…), con id stabili; le righe di significato le puoi annotare dopo.
- **Rami**: un `branch` ha condizione (carta avversaria + `afterStepId`) e passi propri; quando l'avversario interrompe e cambia la linea, "Salva come ramo" riusa i passi registrati dal punto di divergenza.


### 8.1 Drag & drop del campo (manuale e automatico)

Principio: **trascinare una carta su una destinazione è il modo principale di giocare**; il menu contestuale resta come alternativa.

| Origine → destinazione | Azione proposta (la prima è il default) |
|---|---|
| Mano (mostro) → Zona Mostro | Evocazione Normale · Evocazione Speciale · Calata (coperta in DEF) · Evocazione per Tributo (se servono tributi, si scelgono toccando i mostri) |
| Mano (Magia/Trappola) → Zona M/T | Attiva · Cala |
| Mano → Terreno / Zona Pendulum | Attiva · Cala |
| Extra Deck → Zona Mostro / EMZ | Evocazione Speciale; il metodo (Fusione/Synchro/Xyz/Link) è dedotto dal tipo, i materiali si scelgono dopo |
| Cimitero / Bandite / Deck → Zona | Evocazione Speciale · Attiva · Cala (a seconda del tipo) |
| Carta in campo → altra zona | Cambia zona (Link) · Cambia posizione (tocco/doppio clic) |
| Carta qualsiasi → Cimitero / Bandite / mano / Deck (cima, fondo, mescola) | Manda · Bandisci · Riprendi · Rimetti |
| Carta → su un mostro Xyz | Aggiungi come materiale · Equipaggia (se è un equipaggiamento) |
| Doppio clic / doppio tocco su una carta | Attiva (effetto principale) |

Comportamento:
- Alla presa si **evidenziano solo le destinazioni sensate**; le altre restano opache. Nel **manuale** valgono solo regole di buon senso (nessuna regola di gioco); nell'**automatico** si evidenziano **solo le destinazioni per cui il motore ha un'azione legale** (richiesta di tipo "azione libera"): se l'azione non è legale la zona non accetta il rilascio e un tooltip ne spiega il motivo quando possibile.
- Se l'azione è unica, il rilascio la esegue subito; se ce ne sono più di una appare un **piccolo menu sul punto di rilascio** (ordinato per probabilità, con l'ultima scelta ricordata per quella carta). Scorciatoie PC: `Shift` = Speciale, `Alt` = Cala, `Ctrl` = Attiva durante il rilascio.
- Ogni rilascio crea **un passo "di significato"** (`normalSummon`, `specialSummon`+`method`, `setMonster`/`setSpellTrap`, `activate`, …) con i relativi `moves`. Il formato non cambia (`COMBO_FORMAT.md` §7).
- **Annulla/ripeti** sempre disponibili (`Ctrl+Z`/`Ctrl+Shift+Z`, pulsanti, gesto a due dita).
- **Touch/tablet**: un trascinamento inizia dopo una pressione di ~200 ms (per non confondersi con lo scroll) o subito se la carta è già selezionata; sul campo lo scroll è disattivato (`touch-action: none` solo sulle carte). In alternativa: **tocca la carta, poi tocca la zona** (due tocchi), e menu contestuale con pressione lunga.
- **Mouse**: trascinamento immediato oltre 4 px di movimento; clic destro = menu contestuale.
- **Tastiera / screen reader**: Invio sulla carta apre "Sposta in…" con l'elenco delle destinazioni; frecce per scegliere; annunci ARIA dell'azione eseguita.
- **Libreria**: `@dnd-kit/core` (sensori pointer, touch e tastiera separati, overlay di trascinamento, accessibilità integrata). Versione e compatibilità si verificano in fase 2/3; se non soddisfa i criteri di fluidità si ripiega su una implementazione con Pointer Events.
- **Prestazioni**: durante il trascinamento si animano solo `transform`/`opacity` dell'overlay; le zone calcolano l'hit-test con `getBoundingClientRect` memorizzati all'inizio del trascinamento.
- **Test**: Playwright con mouse (drag reale) e con `touchscreen` emulato su tablet (768/1024), per ogni coppia origine→destinazione della tabella.

---

## 9. Export (fasi 3–4)

- **JSON / testo / compatto Discord / ydk / ydke**: funzioni pure in `domain/format`, testate con snapshot.
- **Link**: JSON minimizzato → deflate (fflate) → base64url nel frammento `#`, mai inviato a un server. Se supera ~2 KB si avvisa; il QR usa il livello di correzione più basso e se non basta propone file/appunti.
- **MP4**: `export.worker` disegna i frame su `OffscreenCanvas` (immagini via Cache Storage, CORS ok), codifica con **WebCodecs** (H.264/AVC, `VideoEncoder`) e **Mediabunny** per il contenitore MP4; 1080×1920 e 1920×1080; progresso annullabile con `AbortController`. Fallback `MediaRecorder` dove WebCodecs/H.264 non c'è (formato risultante potenzialmente WebM, dichiarato all'utente). Il rendering usa la stessa scena del replay (un solo codice di disegno, due backend: DOM e Canvas).
- **Backup**: un unico `.json` con tutte le tabelle + versione schema; ripristino con anteprima e modalità "unisci/sostituisci".

---

## 10. UI/UX e design system

- **Token**: 8px grid; raggi 8/12/20; ombre a 3 livelli; un solo accento (proposta: viola-indaco, da decidere con 2 mockup in fase 2); tema scuro predefinito, chiaro opzionale; font di sistema + Inter variabile (self-hosted, `font-display: swap`).
- **Icone**: un solo set (Lucide), importato per singola icona.
- **Layout**: telefono → barra inferiore + bottom sheet; tablet/PC → sidebar + pannelli affiancati. Il campo di gioco è un componente con `aspect-ratio` fisso scalato con CSS (container query), senza scroll orizzontale e senza carte tagliate da 360 a 2560 px.
- **Accessibilità**: contrasto AA verificato (controllo automatico dei token), focus visibile, ruoli ARIA, alternative testuali al drag & drop (menu "sposta in…" da tastiera).
- **Interazioni**: target ≥ 44 px; annulla sempre disponibile; pressione prolungata/clic destro per menu contestuale; Ctrl+K; scorciatoie documentate in un pannello `?`.
- **Controllo qualità visivo**: suite Playwright che per ogni schermata scatta 375/768/1024/1440 × chiaro/scuro × IT/EN, **più** asserzioni automatiche (nessuno scroll orizzontale, nessun elemento che esce dal viewport, nessun testo troncato inatteso). Io guardo gli screenshot prima di consegnare ogni fase.

---

## 11. Sezione "Stats Lab" — statistiche e probabilità

Richiesta: sezione con tutte le statistiche e le probabilità sul modello di *thedeckspace.com*, ma più intelligente.

**Stato**: dal sito riesco a leggere solo la navigazione, ma l'utente mi ha fornito un file di export reale: vedi §11.1 (D2 risolta per l'essenziale; potrò affinare se arrivano screenshot). Non ne copio grafica o contenuti, ne riproduco le *funzioni*. Propongo questo insieme, coerente con quello che fanno i migliori strumenti di analisi YGO e con i dati che l'app ha già:

1. **Mano iniziale (esatta)**: ipergeometrica multivariata per gruppi di carte (es. "almeno 1 starter e 0 brick"), primo/secondo (5/6 carte), per turno `N`, con più condizioni E/O/NON.
2. **Simulatore di mani** (Monte Carlo in worker, 100k+ mani/secondo in JS): condizioni arbitrarie, tasso di successo con intervallo di confidenza, tasso di "brick".
3. **Ruoli delle carte**: tag Starter / Extender / Handtrap / Brick / Engine / Non-engine (assegnabili in massa, con suggerimento automatico dagli archetipi e dal testo) → conteggi e rapporti ideali, e un "indice di consistenza".
4. **Composizione**: distribuzione per tipo, attributo, livello, ATK/DEF, archetipo, costo in punti Genesys.
5. **Copertura delle combo (la novità smart)**: dato il tuo deck e le combo salvate, la % di mani iniziali dalle quali **almeno una** combo salvata è eseguibile (le "carte necessarie" sono già nel formato). Oltre: "quale combo ti manca per coprire più mani".
6. **Cosa-succede-se**: l'effetto sulla probabilità di aprire il gioco aggiungendo/togliendo una copia di una carta o cambiando un ruolo (ordinato per impatto).
7. **Confronto tra varianti** e storico nel tempo (la variante ha cambiato consistenza dopo l'ultima banlist?).
8. **Pescata e ricerca**: probabilità di trovare la carta X entro il turno N, con ricerche (es. "se ho cercato Y, la probabilità di avere Z").
9. **Impatto handtrap avversari**: dalla tua nota "dove colpisce Ash", stima della probabilità di essere interrotto prima del board finale in base a quante interruzioni potrebbe avere l'avversario.
10. **Opzionale (con il motore, fase 5+)**: simulazione reale di N mani campione con EDOPro per misurare quante producono davvero il board target, non solo "hanno le carte giuste". Più lenta; esposta come analisi in background con barra di avanzamento.

Piazzamento in roadmap: fase 8, con le parti 1, 3, 4 anticipabili alla fine della fase 2 se vuoi (sono poco costose e molto utili con il deck editor).

### 11.1 Cosa ho capito di Deckspace dal file `YGO_DECKSPACE` v1 che mi hai dato

Il file mostra il modello del sito (interpretazione mia dai campi; le parti marcate *(ipotesi)* vanno confermate da te):

| Campo | Significato dedotto | In Combo Lab |
|---|---|---|
| `project_settings.assumed_deck_size`, `use_assumed_deck_size` | Simula un mazzo di N carte riempiendo con carte "vuote" | Stesso concetto: "mazzo ipotetico di 40" per confrontare ratio senza modificare la lista |
| `use_six_card_hand` | Mano da 6 (giocare secondo) invece di 5 | Interruttore Primo/Secondo |
| `tournament_rounds` (15), `tournament_mode` ("average") | Probabilità su un torneo di N round: media / rischio di brickare almeno una volta *(ipotesi)* | Stessa analisi, con più modalità (media, almeno 1 brick, almeno k brick, distribuzione completa) |
| `draw_power_mode` ("fast") | Quanto contano le carte che pescano (es. Pot of Prosperity): modalità veloce/approssimata vs esatta *(ipotesi)* | Calcolo esatto sempre; modalità "veloce" solo per mazzi enormi |
| `deck[].tags` (`S1`, `C2`, `C3`, `NS`, `NE`, `GARNET`) | Ruoli: **S1** = da sola gioca (starter); **C2/C3** = pezzo di combo che funziona in coppia/tris; **NS** = Evocabile Normalmente; **NE** = non-engine (handtrap, ecc.); **GARNET** = ruolo speciale legato a `garnet_links` *(ipotesi)* | Tag ruolo liberi + preset (Starter, Extender, Combo-2, Combo-3, Non-engine, Normal Summonable, …) |
| `combo_strings` / `brick_strings` / `forbidden_strings` / `draw_strings` | Per ogni carta: con quali carte fa combo, con quali è brick (a coppie ripetute = es. "due copie di sé stessa"), combinazioni vietate, combinazioni che pescano | Li generiamo **dalle combo salvate** (vedi sotto) e restano modificabili |
| `combo_labels` | Tabella precalcolata: ogni coppia/tris di carte della mano → `PLAYABLE` o `BRICK` (inserita a mano dall'utente nel sito) | **Etichettatura automatica** da combo salvate + override manuale |

**Compatibilità tra carte C2 (requisito dell'utente)**: non tutte le carte con tag C2 fanno combo se pescate insieme. Il modello quindi NON assume che due C2 qualsiasi siano giocabili: ogni coppia (e tris) è PLAYABLE solo se esplicitamente compatibile. Fonti, in ordine di priorità: (1) etichette manuali dell'utente; (2) `combo_strings`/`brick_strings` per carta (formato Deckspace); (3) combo salvate (le "carte necessarie" di una combo rendono compatibile quell'insieme); (4) gruppi di compatibilità (es. C2-A, C2-B: carte dello stesso gruppo fanno combo tra loro). Il default per coppie non coperte è "da confermare" (né giocabile né brick) e viene mostrato come incertezza nel risultato, non nascosto.

**Probabilità post-side**: ogni calcolo accetta un `deckOverride` (mazzo dopo gli swap di un piano di side). La pagina mostra Pre-side / Post-side per matchup con la differenza (Δ playable%, Δ brick%) e la composizione dopo i cambi.

**Come lo rendo più smart** (senza copiarne grafica né contenuti):
1. **Import del file `.json` di Deckspace** (e export nello stesso formato, per interoperabilità): il progetto diventa una variante con ruoli e etichette.
2. **Etichette automatiche**: invece di etichettare a mano centinaia di coppie/tris, una mano è `PLAYABLE` se contiene le "carte necessarie" (`setup.hand.required`) di almeno una combo salvata (con grado di rischio se la combo ha un ramo che fallisce contro un handtrap). Le coppie/tris che non copre nessuna combo sono suggerite come `BRICK` da confermare. Le correzioni manuali vincono sempre.
3. **Calcolo esatto** per enumerazione multivariata (mani da 5 o 6) tenendo conto di copie e `alias`; il Monte Carlo serve solo per condizioni complesse.
4. **Torneo**: probabilità di non brickare in N round, almeno k brick, valore atteso, distribuzione; confronto fra varianti.
5. **Sensibilità**: "se passo da 3 a 2 copie di X o aggiungo un handtrap, di quanto cambiano playable% e brick%?" in un solo grafico a barre.
6. **Mano 5 vs 6, mazzo ipotetico, carte che pescano** come nel sito, più scenari "dopo handtrap" (una carta in meno in mano).
7. Il calcolo gira in un Web Worker; con 40 carte e mano da 6 le combinazioni sono ~3,8 milioni: gestibili esatte con raggruppamento per tipo di carta.

---

## 12. PWA, offline e prestazioni

- **Precache** minimo: app shell (< ~200 kB gzip target), i18n della lingua corrente, `manifest.json` dati.
- **Runtime cache**: dataset carte (cache-first, versione nel nome), immagini (cache-first, LRU), script Lua (cache-first, commit nel nome), `.wasm` del core (cache-first, al primo uso).
- **Budget**: shell < 200 kB gzip; ricerca pronta < 300 ms dopo l'avvio (indice costruito in worker, serializzato nel dataset); lista di 1000+ carte virtualizzata; nessun long task > 50 ms sul main thread nelle schermate chiave (verifica con Lighthouse CI + profilo manuale).
- **Obiettivo "< 2 s su telefono medio dopo la prima visita"**: lo misuro su un profilo di throttling di CPU/rete in Playwright/Lighthouse a ogni fase, e riporto il numero reale (non una promessa).
- **Share Target Android**: richiede l'app installata e un `share_target` nel manifest; riceve `.ydk` (file) e testo/URL. Non funziona su iOS (limite della piattaforma, documentato).

---

## 13. Licenze e distribuzione

| Componente | Licenza | Note |
|---|---|---|
| `@n1xx1/ocgcore-wasm` (wrapper) | MIT | |
| `ocgcore` (core EDOPro compilato dentro il wasm) | **AGPL-3.0** | Uso personale: nessun obbligo. **Se l'app diventasse pubblica** va offerto il sorgente completo dell'app a chi la usa in rete (AGPL §13). |
| `CardScripts` | **AGPL-3.0-or-later** | Idem. |
| Mediabunny | MPL-2.0 | Copyleft debole, mantenere intestazioni; modifiche ai suoi file vanno pubblicate. |
| BabelCDB | non dichiarata nella pagina | Uso personale; da rivedere prima di qualsiasi pubblicazione. |
| Dati YGOPRODeck | termini del sito (cache, no hotlink, 20 req/s) | Rispettati dalla pipeline. |
| Immagini e nomi delle carte | © Konami | Uso personale, non commerciale. |

**Ti avviserò** prima di qualsiasi passo che renda l'app pubblica (repository pubblico, dominio condiviso, condivisione con altri utenti), perché a quel punto AGPL e diritti sulle immagini diventano un tema reale. Un file `docs/LICENSES.md` verrà creato in fase 2 con questo schema.

---

## 14. Test e qualità

- **Vitest**: legalità, normalizzazione `canonicalId`, parser import (ydk/ydke/testo/JSON), formato combo (schema + migrazioni), riduttore dei passi, esportatori, calcoli di probabilità (confronto con valori noti), sync (con server finto).
- **Playwright**: flussi chiave + screenshot matrice (4 larghezze × 2 temi × 2 lingue) con asserzioni anti-overflow; PWA offline (rete spenta).
- **Motore**: test di regressione "combo riprodotta = stesso board finale" su un piccolo set di combo reali (da fase 5).
- **CI**: GitHub Actions: tipi → lint → Vitest → build → Playwright.

---

## 15. Decisioni aperte (mi servono le tue risposte)

| # | Domanda | Mia proposta |
|---|---|---|
| D1 | Immagini su Supabase Storage o su Cloudflare R2? | **DECISO (2026-11-19): R2** (egress gratuito); Supabase solo dati/login. |
| D2 | **In attesa dell'allegato dell'utente.** Per "Stats Lab": cosa vuoi esattamente da thedeckspace.com? Il sito non mi mostra le sue funzioni. | Lista/screenshot da te; intanto vale l'elenco del §11. |
| D3 | Priorità Stats Lab: fase 8 come da brief, o le parti base già a fine fase 2? | Anticipare le parti 1, 3, 4. |
| D4 | Colore d'accento | Due mockup in fase 2, scegli tu. |
| D5 | Account Supabase e Cloudflare: li crei tu seguendo le mie istruzioni quando arriviamo alla fase 2? | Sì, passo passo, con screenshot testuali. |

Dettagli minori che decido io e annoto in `docs/DECISIONS.md` (creato in fase 2): libreria di routing, i18n, icone, schema esatto delle tabelle, naming dei file.
