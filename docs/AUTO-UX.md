# Modalità Automatica — obiettivo di usabilità: livello Yu-Gi-Oh! Master Duel

Obiettivo (utente, 2026-11-20): stesso livello di usabilità di Master Duel per la modalità Automatica, copiando il meccanismo del simulatore di riferimento (TrainMyMat, non accessibile dal nostro lato: servono i riferimenti dell'utente) e facendo meglio. Si replica il **funzionamento e i flussi**, non grafica, asset, nomi o contenuti.

## Principi
1. **La board non si copre mai** (o il minimo indispensabile). Tutto ciò che serve sta ai bordi, in fasce compatte o vicino alla carta.
2. **Meno tocchi possibile**: ogni azione frequente in 1–2 tocchi; default intelligenti; scelte uniche automatiche; "ripeti l'ultima scelta".
3. **Sempre chiaro cosa si può fare**: le carte con azioni disponibili si illuminano; ogni stato (effetto usato, Normal Summon fatta, fase) è visibile.
4. **Feedback immediato**: animazione + suono + haptic per ogni azione, mai attese; animazioni saltabili/accelerabili.
5. **Annulla sempre** (illimitato), anche a metà catena.

## Meccanismi (in stile MD) da implementare
**Mano**: ventaglio in basso; tocco su una carta → scheda info compatta (non copre il campo) + **menu a fumetto sopra la carta** (Evoca / Cala / Attiva / Annulla) con solo le azioni legali del core; trascinamento come alternativa. Carte con azioni legali: alone luminoso; senza azioni: attenuate.
**Scelta zona**: dopo l'azione, solo le zone valide lampeggiano; un tocco; se una sola zona valida → automatica (impostazione).
**Extra Deck**: pulsante sul campo → **vassoio compatto** sotto il campo; scegli la carta (info a pressione lunga) → il vassoio si chiude → materiali **sul campo**.
**Materiali / tributi / costi / bersagli**: candidati evidenziati sul posto, il resto attenuato; selezione toccando le carte; **contatore live** ("Livello 6/8", "Link 1/2", "Materiali 2/3"); barra sottile Conferma/Annulla ancorata ai bordi; auto-selezione se unica combinazione; **frecce/linee** dalla carta sorgente ai bersagli.
**Effetti**: carta con effetto attivabile → badge/alone; tocco sulla carta in campo/GL/Bandite → elenco effetti (con icona tipo: ignition/quick/trigger/continuo) e testo dell'effetto; se un solo effetto → un tocco.
**Catena**: avviso compatto in alto "Attivare X?" Sì/No con numero anello; **pila di anelli** visibile (numeri sulle carte, indicatore catena); risoluzione animata in ordine inverso; "Blocca catena" (impostazione: Auto / Chiedi sempre / Mai, come "Conferma attivazione effetti" di MD); opzione "passa sempre".
**Fasi**: pulsante fase in un angolo (Draw → Main1 → Battle → Main2 → End) con un solo tocco per passare alla successiva, menu per saltare; indicatore "Normal Summon fatta", effetti OPT usati.
**Info carta**: pressione lunga ovunque → scheda con arte, testo e stato; mai a tutto schermo.
**Log duello**: pulsante con cronologia azioni/catene (apre un pannello laterale/vassoio piccolo).
**Animazioni**: evocazione (normale/speciale/synchro/xyz/link con effetto distinto), attivazione, negazione, distruzione, Cimitero/Bandite, pesca, cambio posizione, attacco, danno LP; velocità regolabile (×1, ×2, salta) e rispetto di "riduci movimento".
**Suoni**: già presenti (src/features/sound): collegarli a ogni evento.
**Gesture**: tocco = seleziona/azione principale; doppio tocco = azione principale rapida; pressione lunga = info; trascinamento = sposta/evoca; pizzica = zoom campo; due dita = annulla/ripeti.
**Impostazioni**: velocità animazioni, conferme (zona unica auto, materiali auto, catena), haptic, suoni.

## Fasi di lavoro
- **M1 Flusso** (priorità): menu a fumetto sulla mano, scelta zona, vassoio Extra, materiali sul campo con contatori, avvisi di catena compatti, fase con un tocco, info carta a pressione lunga, mano di partenza guidata.
- **M2 Feedback**: animazioni per tipo di evocazione e catena, alone e badge delle azioni disponibili, frecce bersagli, log duello, suoni/haptic su ogni evento.
- **M3 Rifinitura**: gesture avanzate, impostazioni, test di usabilità con l'utente su telefono, ottimizzazione prestazioni.

## Come si misura "livello Master Duel"
Compiti cronometrati con l'utente (es. Link Summon da mano a board finale, una catena a 3 anelli): numero di tocchi, tempo, errori, "cosa non ti è chiaro". Obiettivo: ≤ 3 tocchi per Evocazione Normale, ≤ 5 per un Link Summon con materiali, nessun passaggio che copra il campo.
