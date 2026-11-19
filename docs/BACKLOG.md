# Backlog (feedback del primo test dell'utente, 2026-11-20)

Regola: non si corregge subito; si raccoglie, si decide l'ordine e si fa un giro unico di usabilità.

| # | Segnalazione | Stato | Note / approccio proposto |
|---|---|---|---|
| B1 | Archetipo (e variante, note, side plan): doppio campo nome IT + EN, ridondante | NUOVO (la regola "un solo campo" era stata applicata solo a titolo e note delle combo) | Un solo campo per nome/note di archetipi, varianti, matchup. Si salva sotto la lingua corrente; in lettura lingua corrente, altrimenti la prima disponibile. Migrazione: i dati esistenti con due lingue restano leggibili. |
| B2 | Animazioni assenti nelle combo (editor manuale e automatico) | PREVISTO ma non fatto nell'editor (spec: animazioni 150–250 ms ease-out; il replay le ha, l'editor no) | Animare spostamenti carta (FLIP transform/opacity), evocazione, attivazione effetto, catena (anelli), distruzione/GY/Bandite, cambio posizione; rispetta prefers-reduced-motion; nessun rallentamento. |
| B3 | Link Summon (e materiali in generale): selezione difficoltosa, l'overlay copre la board | NUOVO (mai provato a mano su un Link reale: i test usavano mock e un duello pilotato da codice) | Selezionare i materiali DIRETTAMENTE sul campo (candidati evidenziati sul posto, resto attenuato), barra di conferma compatta ancorata in basso/alto che non copre il campo, contatore "N di M", annulla; niente griglia a tutto schermo. |
| B4 | Usabilità generale insufficiente nelle combo | NUOVO come giudizio (finora verificato con test automatici e screenshot, non con uso reale) | Giro di usabilità dedicato: percorso reale a mano su telefono/tablet/PC per le azioni frequenti (evoca, attiva, catena, bersagli), contare i tocchi, ridurre passaggi, gesture. |
