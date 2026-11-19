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
