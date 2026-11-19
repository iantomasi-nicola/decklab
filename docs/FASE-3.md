# Fase 3 — come provare (versione pubblicabile)

Guida breve per i test manuali. Avvio: `npm run dev` (o l'indirizzo Pages). Tutto funziona anche offline dopo la prima visita.

## Rotte
| Rotta | Cosa c'è |
|---|---|
| `/` | Home: scorciatoie e ultime modifiche (mazzi e combo) |
| `/archetipi`, `/archetipi/:id` | Archetipi, carte chiave/starter/extender, varianti |
| `/mazzi`, `/mazzi/:id` | Varianti di mazzo, editor, legalità, import/export (ydk, ydke, testo, JSON) |
| `/combo`, `/combo/:id` | Elenco combo ed editor (campo, passi, fasi) |
| `/combo/:id/guida`, `/combo/:id/replay` | Guida passo-passo e replay animato |
| `/side` | Side plan per matchup (OUT/IN) |
| `/statistiche` | Probabilità di mano, ruoli, simulazioni, torneo, compatibilità C2 |
| `/impara` | Segnaposto onesto: l'allenamento arriva in una fase successiva |
| `/impostazioni` | Lingua, tema, Suoni, Dati e backup, Account |
| `/importa` | Importa combo/mazzi da file, link o testo |

## Editor combo: gesture e scorciatoie
- **Trascina** una carta su una zona: si apre il menu delle azioni (Evocazione Normale/Speciale, Cala, Attiva, Cimitero…).
- **Con tasto premuto al rilascio**: `Shift` = Evocazione Speciale, `Alt` = Cala, `Ctrl` = Attiva (senza menu).
- **Doppio clic / doppio tocco** su una carta = Attiva. **Clic destro / pressione lunga** = menu "Sposta in…".
- **Due tocchi**: tocca la carta, poi la zona. **Tastiera**: Invio su una carta apre "Sposta in…".
- `Ctrl+Z` / `Ctrl+Shift+Z` annulla/ripeti; `Alt+1…6` salta di fase (Draw, Standby, Main 1, Battle, Main 2, End); `Alt+N` fase successiva.
- Globali: `Ctrl+K` ricerca/comandi, `Ctrl+B` riduce/espande il menu laterale.
- Su telefono l'editor e il replay nascondono la barra alta dell'app per dare più spazio al campo; l'occhio nella barra alterna "solo il mio campo" / "entrambi i campi".
- Replay: `Spazio` play/pausa, frecce passo avanti/indietro, `Home`/`End`, `G` salta al passo.
- Titolo e note: un solo campo, salvato nella lingua corrente.
- Barra delle fasi e chip di stato (Normale già usata, effetti "una volta per turno" usati, attacchi): cliccando il promemoria si salta al passo.

## Suoni
`/impostazioni` → **Suoni**: volume, "silenzia tutto", categorie (azioni di gioco, interfaccia, feedback), vibrazione e pulsanti per ascoltare ogni suono.

## Side plan
`/side` → scegli la variante → **Nuovo matchup**. Tocca una carta del Main per toglierla (OUT) e una del Side per farla entrare (IN): evidenziate in verde/rosso. La barra del bilancio dice cosa manca (OUT = IN, 40–60 carte, legalità). **Applica suggerimenti** usa i ruoli (handtrap/rompi-board) dalle Statistiche; **Copia da…** riusa un altro piano.
**Esporta immagine** crea un PNG verticale/orizzontale. Se OUT ≠ IN compare un avviso e serve la conferma "Esporta comunque"; l'immagine riporta una fascia rossa "PIANO NON BILANCIATO".

## Statistiche
`/statistiche` → scegli variante e mano (5 o 6 carte). Assegna i ruoli alle carte (S1, C2, NE, handtrap…), poi leggi probabilità "giocabile / brick", torneo e simulazioni. Con un piano di side selezionato, il confronto **Pre-side / Post-side** mostra le differenze.

## Backup
`/impostazioni` → **Dati e backup**: *Scarica il backup* (un file con tutto) e *Ripristina da un backup* (con anteprima e annulla). Per spostare una singola combo usa **Condividi** (link/QR/testo) e `/importa`.

## Offline
Dopo la prima visita l'app si apre senza rete (app shell + dataset carte in cache). Il testo degli effetti si scarica alla prima consultazione di una carta: serve la rete la prima volta. Immagini carte: servono `VITE_IMAGE_BASE_URL` (vedi `docs/DEPLOY.md`), altrimenti si vedono i segnaposto.

## Test automatici
- `npm test` (Vitest) · `npx tsc --noEmit`
- E2E: `npm run test:e2e` (dati reali), `npm run test:e2e:decks`, `npx playwright test -c playwright.side.config.ts`
- Giro QA visivo (porta 4190, schermate in `test-results/qa/`): `npx playwright test -c playwright.qa.config.ts`
- PWA su build di produzione (porta 4191): `npx playwright test -c playwright.pwa.config.ts`
