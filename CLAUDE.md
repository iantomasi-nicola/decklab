# Regole permanenti di lavoro (da Nicola)

- Sessione principale: modello **Sonnet**, effort **medium**.
- Sub-agenti: usarli per parallelizzare lavoro indipendente e andare più veloci, con modello **Sonnet** ed effort scelto da me (low/medium/high), **mai oltre high**. High solo dove serve (motore EDOPro, sync, drag & drop, calcoli di probabilità); medium/low per lavoro meccanico (i18n, test, schermate semplici).
- Ottimizzare l'uso giornaliero e settimanale di Claude: niente sub-agenti per compiti piccoli, prompt dei sub-agenti brevi e autosufficienti (puntano a `docs/`), niente riletture inutili, niente screenshot ridondanti, test mirati prima della suite completa.
- Flusso di progetto: lavoro per fasi (`docs/ROADMAP.md`); a fine fase mi fermo e attendo l'ok.
- Branch di sviluppo: `ccr-66bffddf-j9bdnn`. Nessuna PR senza richiesta esplicita.

## Regole di comunicazione (permanenti)
- Dire all'utente, passo passo, cosa si sta facendo (breve, prima e dopo ogni passo significativo).
- Allegare screenshot dove servono (schermate UI, difetti, confronti) con SendUserFile.
- Sub-agenti: riportare all'utente la percentuale di completamento di ciascuno, aggiornata ogni 10%. I sub-agenti devono inviare al principale una riga di avanzamento a ogni 10% (SendMessage), e il principale la inoltra.

## Requisiti di prodotto permanenti
- Editor combo: il campo (board) deve essere il più grande possibile (più largo di un playmat di allenamento tipico), senza mai superare il viewport; tutto il resto in menu/pannelli riducibili. Priorità assoluta: board grande. La mano sta SEMPRE in basso sotto il campo (mai laterale). Il campo mantiene le proporzioni naturali di un playmat: si scala l'intero blocco campo+mano, senza stirare le zone né lasciare bande vuote laterali inutili.
- Priorità di progetto: arrivare presto alle funzionalità principali per i test manuali dell'utente, poi il resto.
- Quando il limite d'uso di Claude si resetta, ripartire subito con nuove task a piena velocità (sub-agenti in parallelo).

## Qualità visiva (regola permanente)
- Mai grafiche, pulsanti o elementi disallineati, sovrapposti, tagliati o "brutti". Ogni schermata consegnata deve avere allineamenti, spaziature (griglia 8px), altezze e icone coerenti.
- Prima di consegnare: guardare gli screenshot (375/768/1024/1440, scuro e chiaro, it/en), cercare difetti di allineamento e correggerli; i controlli automatici Playwright (nessun overflow, nessun elemento fuori viewport, target ≥44px) sono il minimo, non il sostituto dell'occhio.
- Se un difetto è noto e non risolto, dirlo esplicitamente all'utente: non consegnarlo come "fatto".

## Combo lunghe (requisito permanente)
- Le combo possono avere 50+ passi (anche 100). Editor, guida e replay devono restare ordinati, fluidi e senza elementi sovrapposti o tagliati: liste virtualizzate, timeline compatta e scorrevole (raggruppata per fasi/catene, con salto a un passo e ricerca), blocchi di catena comprimibili, scroll automatico al passo corrente, nessuno scroll orizzontale della pagina, prestazioni senza long task. Ogni schermata di combo va testata con una combo di prova da 60 passi a 375/768/1024/1440, scuro/chiaro, it/en.

## Requisiti aggiuntivi (permanenti, da Nicola)
- Titoli e note delle combo: UN solo campo di testo (niente doppio IT/EN). Si salva sotto la chiave della lingua corrente (`meta.noteLang[0]`); in lettura si mostra la lingua corrente e, se manca, la prima disponibile.
- Ogni schermata (smartphone, tablet, PC) deve essere ottimizzata: niente testi compressi, disallineati o che strabordano.
- Velocità: nessun rallentamento o attesa durante le combo; pulsanti facili da premere su ogni dispositivo; gesture dedicate (tocco, doppio tocco, pressione lunga, trascinamento).
- Suoni professionali per ogni azione (sintesi WebAudio, volume/mute/categorie nelle impostazioni, mai fastidiosi).
- Scelta di bersagli/selezioni: sempre chiara e ben visibile (evidenzia i candidati, oscura il resto, contatore "scegli N", conferma/annulla ovvi).
- Indicatori di gioco chiari con icone specifiche e coerenti: tipo di effetto (ignition, quick, trigger, continuo, attivazione, catena), evocazioni (normale, speciale, tributo, fusione/synchro/xyz/link/rituale/pendulum), negazioni, ecc.
- Barra delle fasi coerente (Draw, Standby, Main 1, Battle, Main 2, End) con pulsanti per passare da una fase all'altra, e promemoria di ciò che hai già fatto: Evocazione Normale già usata, effetti "una volta per turno" già attivati (per carta/effetto), carte che hanno già attaccato, ecc.
- Video MP4: l'immagine di copertina (poster/prima miniatura) è la board finale.
- Sezione "Side plan" contro i matchup: per ogni matchup scegli OUT e IN, evidenziati in verde, controllo coerenza (in = out, 40-60 carte, legalità), esporta immagine; funzioni smart realmente usate (suggerimenti dagli handtrap/tag, copia da altri piani, effetto sulle probabilità).
