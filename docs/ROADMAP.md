# Combo Lab — Roadmap

Stato: **bozza per approvazione** · Data: 2026-11-19

Mantengo le tue 8 fasi. Per ognuna: contenuto, **criteri di completamento** (verificabili), cosa devi fare tu, e rischi.
Alla fine di ogni fase mi fermo e ti dico: cosa funziona, cosa manca, come provarlo, e attendo il tuo ok.

## Definizione di "fatto" valida per ogni fase

1. Tutti i test Vitest e Playwright passano in CI.
2. Screenshot Playwright a 375 / 768 / 1024 / 1440 px × tema chiaro/scuro × italiano/inglese, **guardati da me** e difetti corretti; zero scroll orizzontale, zero testi tagliati.
3. Nessuna stringa hardcoded (test automatico sulle chiavi i18n IT/EN).
4. Misura reale di prestazioni (peso bundle, tempo di avvio con CPU/rete limitate) riportata nel resoconto.
5. Breve guida "come provarla" in `docs/FASE-N.md`.
6. Tutto funziona offline dove previsto.

---

## Fase 1 — Documenti *(questa)*
- `ARCHITECTURE.md`, `COMBO_FORMAT.md`, `ROADMAP.md`.
- **Completa quando**: hai letto, risposto alle decisioni D1–D5 (in `ARCHITECTURE.md` §15) e dato l'ok.

---

## Fase 2 — Base
**Contenuto**
1. Progetto Vite + React + TS strict, Tailwind, lint, CI, Cloudflare Pages.
2. Design system: token, tema chiaro/scuro, componenti base, icone, layout responsive (barra in basso / sidebar), stati vuoti, skeleton.
3. i18n IT/EN (rilevamento + impostazioni) con test di completezza chiavi.
4. PWA: manifest, service worker, offline dell'app shell, share target Android.
5. Pipeline dati (`scripts/build-data`): dataset carte EN+IT compatto, `alias`, archetipi, Genesys, banlist correnti e storiche; versione e aggiornamento.
6. Ricerca carte IT/EN tollerante ai refusi (worker), virtualizzazione liste, Ctrl+K globale (base).
7. Archetipi → varianti → decklist, con editor (aggiunta a un tocco, contatori, statistiche essenziali, filtri).
8. Legalità in tempo reale + banner + avviso "nuova banlist: cosa diventa illegale".
9. Import (ydk, ydke, testo IT/EN, JSON app; drag & drop, incolla, condivisione) con riconoscimento automatico e disambiguazione. Export ydk/ydke/testo.
10. Immagini: servizio "scarica una volta" + cache locale.
11. Sync Supabase: auth (magic link, Google), RLS, outbox, pull + realtime, soft delete, indicatore di stato.
12. *(Opzionale, se confermi D3)* Stats Lab base: probabilità mano iniziale, ruoli carte, composizione.

**Completa quando**
- Posso creare un archetipo e una variante, importare un `.ydk` e una lista testuale (IT e EN), vedere i problemi di legalità con banner e carte evidenziate, esportare in ydk/ydke/testo.
- La ricerca "ash blossom" e "fioritura di cenere" trova la stessa carta, anche con un refuso.
- Cambio banlist selezionata → la legalità si aggiorna subito; carico una banlist nuova di prova → compare il riepilogo di varianti rese illegali.
- Modifiche fatte offline compaiono sull'altro dispositivo dopo la riconnessione; un conflitto sulla stessa entità si risolve con last-write-wins e senza perdere altre entità.
- Scollegando la rete, l'app si apre e funziona (dataset e immagini già visti).
- Lighthouse PWA verde; tempo di avvio a caldo riportato (obiettivo < 2 s su profilo "telefono medio").

**Cosa fai tu** (ti guiderò passo passo): creare progetto Supabase (gratuito), account Cloudflare (Pages + R2 se D1 = R2), collegare il repository GitHub, inserire due chiavi pubbliche nelle variabili d'ambiente.
**Rischi**: banlist storiche (cronologia git: va controllata a mano); dimensione del dataset; correttezza `alias` per gli artwork.

---

## Fase 3 — Combo manuali, guida, replay, annulla, export base
**Contenuto**
- Formato `combolab.combo` v1 implementato (tipi, JSON Schema generato, validazioni V1–V9, migrazioni, test).
- **Drag & drop come modo principale di giocare** (PC e tablet, anche telefono): trascinare carte su zone per Evocazione Normale/Speciale, Cala, Attiva, manda al Cimitero, bandisci, materiali Xyz, ecc., con menu di scelta al rilascio, scorciatoie `Shift/Alt/Ctrl`, doppio clic = attiva, alternativa a due tocchi e da tastiera (`ARCHITECTURE.md` §8.1).
- Campo di gioco completo (entrambi i giocatori: 5 mostri, 2 EMZ, 5 S/T, Terreno, Pendulum, Deck, Extra, Cimitero, Bandite, mano), drag & drop touch/mouse, menu contestuale (pressione lunga / clic destro), posizioni, coperte/scoperte, materiali Xyz, token, segnalini, LP; alternativa da tastiera.
- Editor manuale: ogni azione diventa un passo annotabile (note IT/EN), gruppi "ordine libero", rami.
- Annulla/ripeti illimitati.
- **Modifica di una combo esistente** (inserisci, elimina, sostituisci un passo in qualunque punto) con ricalcolo dello stato e **evidenza dei passi successivi che diventano incoerenti**.
- **"Crea variante da questo passo"**: su ogni passo, copia la combo fino a quel passo (compreso, oppure prima di esso) in una nuova combo collegata (`meta.derivedFrom`), che continui con una linea diversa. Nella guida: elenco "Varianti di questa combo" con il passo in cui divergono e il confronto affiancato delle due linee dal punto di divergenza. Alternativa nello stesso documento: "salva come ramo".
- Pagina combo in stile guida (mano iniziale, passi, board finale, rami, badge legalità con banlist attuale) e pagina archetipo (piano di gioco, carte chiave, starter/extender, handtrap, collegamenti).
- Replay: play/pausa, passo avanti/indietro, velocità, salto, timeline, animazioni, carta attiva e catena evidenziate.
- Export JSON, testo numerato e compatto Discord (copia con un tocco), link compresso + QR, import da link/file/appunti, backup/ripristino completo.
- Tag, preferiti, ricerca globale, duplicazione di qualsiasi elemento.
- **Funzioni smart (scelte dall'utente, solo le più usate):**
  1. **Note con carte inline**: scrivendo `@Ash` nella nota di un passo compare la carta (immagine e testo) al tocco; nella guida e nel testo esportato diventa il nome nella lingua scelta.
  2. **Controllo coerenza combo**: segnala passi incoerenti (carta usata senza essere in mano o cercata, materiale non sul campo, "una volta per turno" ripetuto) con un pulsante "Controlla" nell'editor, usando la validazione di dominio.
  3. **Mano di prova**: pesca una mano casuale dal mazzo della variante e mostra quali combo salvate sono giocabili con quelle carte (si appoggia alle "carte necessarie" già nel formato); "Cosa posso fare con A, B, C?" come ricerca inversa.
  4. **Avviso banlist con passi interessati**: oltre a segnalare le combo rese illegali, evidenzia i passi che usano la carta limitata/proibita.

**Completa quando**
- Creo da zero una combo di 15 passi con 1 ramo da telefono e da PC, la rivedo in replay, la esporto in tutti i formati e la reimporto identica (test "round-trip").
- Un link con una combo da 20 passi si genera, si apre sull'altro dispositivo e la importa; il QR è scansionabile (test automatico di lettura).
- Backup → cancellazione dati → ripristino: nulla di perso.
- Da un passo qualsiasi creo una variante, ne modifico la parte finale e la combo madre non cambia; la guida mostra madre e figlia collegate.
- Ogni coppia origine→destinazione della tabella di `ARCHITECTURE.md` §8.1 funziona con mouse e con tocco (test Playwright su 768 e 1024 px); lo scroll della pagina non interferisce con il trascinamento.
- Il campo si scala da 360 a 2560 px senza scroll orizzontale né carte tagliate, in verticale e orizzontale.

**Rischi**: complessità del drag & drop su touch (scroll vs trascinamento); precisione della conversione "azione → stato" in manuale.

---

## Fase 4 — Export MP4 e rifinitura
**Contenuto**
- Scena di rendering condivisa DOM/Canvas; export verticale 1080×1920 e orizzontale 1920×1080: titolo iniziale, passo, azione, nota, board aggiornato, board finale.
- WebCodecs + Mediabunny in worker, avanzamento e annullamento; fallback `MediaRecorder`.
- **Copertina del video = board finale** (poster/prima immagine e miniatura PNG).
- **Immagine del board finale condivisibile** (PNG, verticale e orizzontale) con elenco dei passi, come alternativa leggera al video; stessa scena di rendering dell'MP4.
- Rifinitura di animazioni (150–250 ms, ease-out, solo transform/opacity, "riduci movimento"), microinterazioni, accessibilità, polish di tutte le schermate delle fasi 2–3.

**Completa quando**
- Un MP4 di 30 passi si produce sul telefono e sul PC, si riproduce su iOS/Android/PC con immagini nitide e testi nella lingua scelta; l'interfaccia resta fluida durante l'export.
- Audit accessibilità (contrasto AA, focus, etichette) senza difetti bloccanti.

**Rischi**: supporto H.264 in WebCodecs sui dispositivi (il fallback cambia il formato: te lo dico esplicitamente); memoria su telefoni economici per 1080×1920.

---

## Fase 5 — Modalità automatica EDOPro
**Si apre con uno spike di 1–2 giorni** (prima di scrivere la UI): caricare il core in un Web Worker (build sync), avviare un duello con 5 carte, misurare dimensione wasm, tempo di avvio, memoria, e verificare il caricamento di script via jsDelivr con commit fissato. Ti riporto i numeri e **ti dico se la fase è fattibile come descritta o cosa cambiare** prima di continuare.

**Contenuto**
- Motore nel worker, protocollo UI⇄worker, precaricamento degli script e "rigioca da capo" se ne manca uno.
- Stesso drag & drop della fase 3, ma le destinazioni evidenziate sono **solo quelle con un'azione legale del motore**.
- Interfaccia per ogni richiesta del motore (selezioni, catene, posizioni, zone, somme di livelli, dichiarazioni, sì/no, ordinamenti), ottimizzata per touch.
- Catene automatiche e livello di pausa (sempre / solo se posso rispondere / mai); risoluzione automatica delle scelte uniche.
- Primo/secondo con regole corrette.
- Annulla/ripeti illimitati (seed + risposte).
- Normalizzatore messaggi → `steps` del formato; `engine` salvato.
- Avviso se una carta non è simulabile (script mancante) con ripiego in manuale.

**Completa quando**
- Gioco una combo reale di un archetipo che scegli tu (da concordare), la salvo, la riapro in guida/replay/testo senza motore e con motore ottengo lo **stesso board finale**.
- Annulla 20 volte e ripeti 20 volte senza perdere stato.
- Il thread principale non si blocca (nessun long task > 100 ms durante il motore).
- Con rete spenta, se gli script erano già in cache, funziona.

**Rischi principali**: dimensione/avvio del wasm; carte nuove senza script; memoria ricreando duelli; richieste del core più varie del previsto (gestisco una tabella messaggi → componente completa dai tipi del pacchetto).

---

## Fase 6 — Avversario
**Si apre con uno spike** sul "già usato questa partita" (effetti "una volta per turno") per dichiarare il limite reale prima di promettere.

**Contenuto**
- Setup avversario (mano, campo, Cimitero, Bandite, LP) e comportamenti per ogni effetto rapido: Chiedimi / Auto prima occasione / Auto solo su carte scelte / Mai; bersagli manuali o lista di priorità.
- Editor board avversarie e preset riutilizzabili; board finale di una combo come preset.
- Diramazioni: "se l'interruzione cambia la linea, salva come ramo".
- Calcolo letale giocando secondo.

**Completa quando**
- Una combo con un handtrap "Auto alla prima occasione" produce la deviazione, mi propone il ramo e il ramo si salva e si rigioca.
- Un preset si applica a due combo diverse; una board finale diventa avversaria di un'altra combo.
- Il limite sugli effetti "una volta per turno" è documentato con esempi (funziona/non funziona).

**Rischi**: "solo con regole, niente IA" richiede di definire bene le priorità; letale: se il core non espone abbastanza, uso un calcolo semplificato dichiarato.

---

## Fase 7 — Modalità Impara
**Contenuto**
- Pulsante "Impara" su ogni combo: mano necessaria o casuale che le contiene.
- Confronto azione utente ↔ passo atteso (carta + azione + bersagli); avviso chiaro; Riprova (annulla automatico), Suggerimento, Salva come ramo.
- Livelli di aiuto: nessuno / solo la carta / passo completo; rispetto dei gruppi "ordine libero".
- Allenamento contro handtrap (l'avversario interrompe, devo seguire il ramo giusto).
- Ripasso con ripetizione dilazionata (più errori → torna più spesso).
- Quiz per archetipo e per combo; statistiche (tentativi, errori per passo, tempo, serie).

**Completa quando**
- Eseguo una combo con 0 errori e una con 3 errori deliberati: avvisi corretti, statistiche corrette, la combo sbagliata torna prima nel ripasso.
- Un ramo handtrap viene richiesto e riconosciuto.
- Quiz generati senza duplicati e senza risposte ovvie (test su 3 archetipi).

---

## Fase 8 — Stats Lab, calcolatore di probabilità e rifiniture finali
**Contenuto** (dettaglio in `ARCHITECTURE.md` §11)
- Import/export del formato `YGO_DECKSPACE` v1 (`ARCHITECTURE.md` §11.1); etichette PLAYABLE/BRICK automatiche dalle combo salvate; modalità torneo.
- Mano iniziale esatta (ipergeometrica) e per turno, condizioni E/O/NON, primo/secondo.
- Simulatore Monte Carlo in worker con intervallo di confidenza.
- Ruoli delle carte (starter, extender, handtrap, brick…), composizione, indice di consistenza.
- Copertura delle combo salvate sulle mani possibili; "cosa-succede-se"; confronto tra varianti; storico.
- *(Opzionale con motore)* simulazione reale di mani campione.
- Rifiniture finali: prestazioni, accessibilità, pulizia, documentazione, guida d'uso, backup automatici.

**Completa quando**
- I valori esatti coincidono con casi noti calcolati a mano (suite di test); il simulatore converge verso il valore esatto entro l'intervallo dichiarato.
- Tutte le schermate rispettano il budget prestazionale e passano l'audit visivo e di accessibilità finale.

**Nota su thedeckspace.com**: D2 risolta con il file di export fornito (§11.1 dell'architettura); screenshot aggiuntivi possono affinare i dettagli.

---

## Piano di rischio e priorità

| Rischio | Impatto | Quando lo tratto |
|---|---|---|
| Core wasm pesante/lento su telefono | Alto (fase 5) | Spike prima di costruire la UI |
| Banlist storiche da cronologia git non pulita | Medio | Fase 2, revisione assieme a te |
| Supabase gratuito in pausa dopo 7 giorni | Basso (local-first) | Fase 2, avviso nell'app |
| H.264 non disponibile su alcuni browser | Medio | Fase 4, fallback dichiarato |
| Script mancanti per carte nuove | Medio | Fase 5, avviso + manuale |
| AGPL se l'app diventa pubblica | Alto *se* pubblica | Ti avviso prima di ogni passo che la rende pubblica |
| Effetti "una volta per turno" già usati | Medio | Spike in fase 6, limite documentato |

## Cosa mi serve da te prima di iniziare la Fase 2
Le risposte a D1–D5 in `ARCHITECTURE.md` §15 (le più importanti: **D1** immagini, **D2** funzioni di thedeckspace da replicare).


## Aggiunte richieste dall'utente (priorità dopo l'alpha, salvo dove indicato)
- **Alpha (subito)**: note a campo unico, barra delle fasi e indicatori di stato (Normal Summon fatta, effetti OPT usati), icone specifiche per tipo di effetto e di evocazione, selezione bersagli chiara, suoni WebAudio, gesture, ottimizzazione responsive di ogni schermata.
- **Side plan contro i matchup**: sezione per piani di side (OUT/IN evidenziati in verde, controlli di legalità e di conteggio, copia tra piani, suggerimenti dai tag handtrap/anti-archetipo, impatto sulle probabilità con Stats Lab, esporta immagine PNG).
- **Compatibilità C2 e probabilità post-side** (richiesta utente): le carte C2 non sono tutte compatibili tra loro (matrice/gruppi di compatibilità, derivata dalle combo salvate e modificabile, coppie non coperte = "da confermare" con incertezza mostrata); ogni statistica ha una modalità Pre-side / Post-side per matchup (piani di side) con le differenze.
