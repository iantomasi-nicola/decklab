# Formato standard delle combo — `combolab.combo` v1

Stato: **bozza per approvazione** · Data: 2026-11-19

Un unico formato alimenta: combo manuali e automatiche, pagina guida, replay, export (JSON, testo, link, MP4) e modalità Impara.
È **indipendente dalla lingua** (carte = passcode, testi liberi per lingua) e **dalla versione del motore/script**
(i passi descrivono *cosa succede*, non *come lo calcola il core*).

> Fonte di verità: i tipi TypeScript in `src/domain/combo/types.ts`. Da quei tipi uno script genera
> `schema/combo.v1.schema.json` (JSON Schema, draft 2020-12); la CI fallisce se i due non coincidono.
> Qui sotto c'è la specifica leggibile.

---

## 1. Principi di progetto

1. **Ogni passo porta il proprio effetto sullo stato** (`moves`). Il replay è quindi un semplice riduttore `applyStep(stato, passo)`, senza motore. Il motore (se usato) serve a *generare* i passi e a rigiocarli esattamente.
2. **Significato separato dal risultato**: `action`/`card`/`effect`/`targets`/`costs` dicono *che cosa* è stato fatto (usato da guida, testo e Impara); `moves` dicono *cosa si è mosso* (usato da replay e video).
3. **Carte = passcode** (numeri). I nomi si risolvono al momento della visualizzazione nella lingua scelta. Una copia fisica in partita è un'**istanza** (`uid`), perché due copie della stessa carta sono cose diverse.
4. **Additivo e verificabile**: campi opzionali non rompono i lettori; un `v` più alto di quello supportato apre il file in sola lettura con avviso.

---

## 2. Struttura di primo livello

```jsonc
{
  "format": "combolab.combo",      // costante, obbligatorio
  "v": 1,                          // intero, obbligatorio
  "meta":     { … },               // §3
  "deck":     { … },               // §4
  "cards":    { "u1": 14558127 },  // §5  registro istanze: uid → passcode
  "setup":    { … },               // §6
  "steps":    [ … ],               // §7  linea principale
  "branches": [ … ],               // §8
  "endboard": { … },               // §9
  "engine":   { … },               // §10 facoltativo
  "x":        { … }                // spazio estensioni (qualsiasi chiave ignota è preservata)
}
```

Campi sconosciuti vengono **preservati** in lettura/scrittura (non si perdono dati scritti da versioni future).

---

## 3. `meta`

| Campo | Tipo | Note |
|---|---|---|
| `id` | UUID | Identità stabile; al *duplica* ne viene generato uno nuovo. |
| `title` | `{ it?: string, en?: string }` | Almeno una lingua. |
| `scope` | `"variant"` \| `"archetype"` | "generale" per l'archetipo oppure legata a una variante. |
| `archetype` | `{ id?: UUID, name: {it?,en?} }` | Il nome rende il file leggibile fuori dall'app. |
| `variant` | `{ id?: UUID, name: {it?,en?} }` \| `null` | `null` se `scope = "archetype"`. |
| `rules` | `"TCG"` \| `"OCG"` | Insieme di regole/carte. |
| `banlist` | `{ format: "TCG"\|"OCG"\|"GENESYS"\|…, id: "2026.10" }` | Banlist di riferimento. Il badge "legale con la banlist attuale" si ricalcola sempre; questo è il riferimento storico. |
| `tags` | `string[]` | |
| `noteLang` | `string[]` | Lingue delle note presenti, es. `["it","en"]`. |
| `favorite` | `boolean` | |
| `createdAt`, `updatedAt` | ISO 8601 UTC | |
| `author` | `string?` | Facoltativo. |
| `source` | `"manual"` \| `"engine"` \| `"import"` | Come è stata creata. |
| `derivedFrom` | `{ comboId, afterStep, title? }` (opz.) | La combo è una **variante creata "da questo passo"** di un'altra: `comboId` = madre, `afterStep` = ultimo passo copiato (`null` = dall'inizio). Il campo è additivo (nessun cambio di `v`). Distinta dai `branches` (che descrivono interruzioni dell'avversario). |

---

## 4. `deck`

Passcode delle tre sezioni, **con ripetizioni** (una per copia), nell'ordine voluto dall'utente.

```jsonc
"deck": {
  "main":  [14558127, 14558127, …],
  "extra": [ … ],
  "side":  [ … ],
  "ydke": "ydke://…"      // facoltativo, derivato; se presente deve coincidere con main/extra/side
}
```

- `ydke://` = `ydke://` + base64(main) + `!` + base64(extra) + `!` + base64(side) + `!`, dove ogni sezione è una sequenza di interi senza segno a 32 bit **little-endian**.
- Gli artwork alternativi mantengono il passcode scelto; la **carta canonica** per i conteggi di legalità è `alias || id` (vedi `ARCHITECTURE.md` §4.2).

---

## 5. `cards` — registro delle istanze

Mappa `uid → passcode` per **ogni copia fisica citata** in setup, passi o board (mano, carte cercate, materiali, token).
Gli `uid` sono stringhe brevi e stabili nel documento: `"u1"`, `"u2"` … per le carte del giocatore, `"o1"`, `"o2"` … per quelle dell'avversario. I token hanno passcode del token e `"token": true` in `x` se utile.

Carte del deck non ancora rivelate non compaiono finché un passo non le porta in gioco/mano (`searched`, `draw`): in quel momento nasce l'`uid`.

---

## 6. `setup`

```jsonc
"setup": {
  "first": true,                     // true = giochi per primo, false = per secondo
  "hand": {
    "required": ["u1", "u2"],        // carte che devono essere in mano (le "carte necessarie")
    "size": 5,                       // 5 se primo, 6 se secondo (derivabile, esplicito per chiarezza)
    "fill": "random"                 // "random" = completa con carte casuali del deck; "none" = mano esatta
  },
  "own":      { …Board… },           // stato iniziale proprio (opzionale; di default campo vuoto, LP 8000)
  "opponent": {
    "board": { …Board… },            // campo, cimitero, bandite, mano, LP dell'avversario
    "interrupts": [ …Interrupt… ]    // comportamenti degli handtrap, §6.2
  }
}
```

### 6.1 `Board`
```jsonc
{
  "lp": 8000,
  "places": [                         // dove si trova ogni istanza
    { "uid": "u3", "place": { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" } }
  ]
}
```
`Place` (`loc` = luogo):

| `loc` | `seq` | Note |
|---|---|---|
| `deck` | indice (0 = cima) opz. | |
| `hand` | indice opz. | |
| `extra` | — | |
| `gy`, `banished` | — | Ordine = ordine di arrivo. |
| `mzone` | 0–4 | Zone Mostro principali. |
| `emz` | 0–1 | Extra Monster Zone sinistra/destra. |
| `szone` | 0–4 | Zone Magia/Trappola. Le zone Pendulum sono `szone` 0 e 4 (regola corrente). |
| `fzone` | — | Terreno. |
| `overlay` | indice | Materiale Xyz; richiede `host` = `uid` del mostro Xyz. |

`pos` ∈ `FACEUP_ATK`, `FACEUP_DEF`, `FACEDOWN_DEF`, `FACEUP` (Magia/Trappola/Terreno scoperti), `FACEDOWN` (coperti).
Ogni `Place` ha `p`: `0` = giocatore, `1` = avversario (omesso = `0`).
Segnalini: `"counters": { "u5": { "spell": 2 } }`.

### 6.2 `Interrupt` (comportamento degli handtrap/effetti rapidi avversari)
```jsonc
{
  "uid": "o1",                                  // carta avversaria in setup
  "mode": "ask" | "auto-first" | "auto-selected" | "never",
  "when": [ { "card": 14558127 } ],             // solo per "auto-selected": quali carte/effetti del giocatore fanno scattare la risposta
  "target": "manual" | "priority",              // come scegliere i bersagli
  "priority": [ 14558127, 23434538 ]            // lista di passcode in ordine di preferenza, se target = "priority"
}
```
Corrispondono ai quattro comportamenti richiesti ("Chiedimi", "Auto alla prima occasione", "Auto solo su carte o effetti che scelgo", "Mai").

---

## 7. `steps` — i passi "di significato"

Ogni passo è un oggetto:

```jsonc
{
  "id": "s1",                       // unico nel documento (anche tra i rami)
  "action": "activate",             // §7.1, enum chiuso
  "card": "u1",                     // istanza protagonista (opzionale per azioni di sistema)
  "effect": { "kind": "ignition", "index": 1 },   // facoltativo; vedi sotto
  "from": { "loc": "hand" },        // origine "principale" (facoltativo, per leggibilità)
  "to":   { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" },
  "targets":  ["u4"],               // istanze bersagliate/scelte
  "costs":    [ { "kind": "discard", "cards": ["u2"] } ],
  "searched": ["u9"],               // istanze cercate (Deck → mano) o rivelate
  "moves": [                        // EFFETTO SULLO STATO — obbligatorio (può essere [])
    { "uid": "u1", "to": { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" }, "why": "summon" }
  ],
  "lp":       [ { "p": 0, "delta": -1000 } ],
  "counters": [ { "uid": "u5", "type": "spell", "delta": 1 } ],
  "chain": { "id": "ch1", "link": 1 },          // facoltativo, §7.3
  "group": "g1",                    // facoltativo: "ordine libero", §7.2
  "phase": "main1",                 // facoltativo: draw|standby|main1|battle|main2|end
  "note": { "it": "Cerca il motore.", "en": "Search the engine piece." },
  "optional": false                 // se true la guida lo segnala come passo facoltativo
}
```

`effect`: `kind` ∈ `activation` (attivazione di Magia/Trappola), `ignition`, `trigger`, `quick`, `continuous`, `summon-proc` (procedura), `other`; `index` è il numero dell'effetto nel testo della carta (1-based), se noto. Serve a guida e a Impara, non al replay.

`moves[].why` ∈ `summon`, `tribute`, `material`, `cost`, `search`, `draw`, `discard`, `destroy`, `send`, `banish`, `return`, `set`, `flip`, `position`, `equip`, `shuffle`, `other` (descrive il motivo, non cambia il risultato).
`moves[].from` è facoltativo (si ricava dallo stato); se presente deve essere coerente con lo stato corrente (validazione).

### 7.1 `action` (enum chiuso, normalizzato)

| Gruppo | Valori |
|---|---|
| Evocazioni | `normalSummon`, `tributeSummon`, `setMonster`, `flipSummon`, `specialSummon` |
| Metodo (solo con `specialSummon`, campo `method`) | `fusion`, `synchro`, `xyz`, `link`, `ritual`, `pendulum`, `effect`, `procedure`, `other` |
| Attivazioni | `activate` (carta o effetto), `setSpellTrap`, `chainActivate` (risposta in catena) |
| Movimenti | `search`, `draw`, `discard`, `sendToGY`, `banish`, `returnToHand`, `returnToDeck`, `destroy`, `detach`, `shuffle` |
| Campo | `changePosition`, `equip`, `attach`, `placeCounter`, `changeLP` |
| Battaglia / turno | `attack`, `enterPhase`, `endTurn` |
| Sistema | `resolve` (risoluzione separata di una catena, §7.3), `declare` (dichiarazione: tipo/attributo/nome), `choice` (scelta tra opzioni), `custom` (solo manuale, con `label`) |

Le combo manuali possono usare `custom` per ciò che non è modellato; le combo da motore usano solo i valori normalizzati.

### 7.2 Gruppi "ordine libero"
Passi consecutivi con lo stesso `group` possono essere eseguiti **in qualsiasi ordine** in modalità Impara, a patto che producano lo stesso stato risultante. Il gruppo deve essere contiguo e ogni passo deve restare legale in qualunque ordine (verificato dal motore quando disponibile; in modalità manuale è responsabilità dell'utente).

### 7.3 Catene
- Un'attivazione che non genera risposte è **un solo passo** con `moves` che includono costi e risoluzione.
- Se la catena ha più anelli o la risoluzione è separata dall'attivazione, i passi sono ordinati per **momento in cui lo stato cambia**: un passo `activate`/`chainActivate` con `chain: { id, link }` registra attivazione e costi; poi un passo `resolve` con `ref: "<id passo>"` registra l'esito (in ordine inverso di anello).
- La guida mostra gli anelli di una stessa catena come blocco annidato.

### 7.4 Confronto in modalità Impara
Un'azione dell'utente combacia con un passo atteso se coincidono: `action` (e `method`), `code` della carta protagonista (non l'`uid`, perché le copie sono intercambiabili), `effect.index` se presente, e il **multi-insieme** dei passcode di `targets`/`materials`. Le differenze producono l'avviso con "Riprova / Suggerimento / Salva come ramo".

---

## 8. `branches` — diramazioni

```jsonc
"branches": [{
  "id": "b1",
  "title": { "it": "Se usa Ash sulla ricerca", "en": "If Ash on the search" },
  "condition": {
    "afterStep": "s1",                       // passo della linea principale a cui si riferisce
    "window": "activation" | "resolution",   // in risposta all'attivazione o alla risoluzione
    "opponent": { "code": 14558127, "effect": 1 }   // carta/effetto avversario
  },
  "steps": [ …Step… ],                       // passi propri (ids unici nel documento)
  "rejoin": "s5" | null,                     // passo della linea principale in cui si rientra (o null se finisce da sé)
  "endboard": { …Endboard… } | null,         // board finale del ramo, se diverso
  "note": { "it": "…", "en": "…" }
}]
```
Un ramo parte dallo stato dopo `afterStep` (più l'effetto dell'interruzione, che compare come primo passo con `action: "custom"`/`"resolve"` e `x.opponent: true`, oppure come `moves` dell'avversario). Più rami possono dipendere dallo stesso passo.

---

## 9. `endboard`

```jsonc
"endboard": {
  "own": { …Board… },
  "opponent": { …Board… },
  "summary": { "it": "Sovrano X + 2 negate", "en": "Boss X + 2 negates" },   // facoltativo
  "hash": "…"                                   // facoltativo: impronta dello stato derivato
}
```
Il board finale si può sempre **ricalcolare** applicando i passi; è memorizzato per mostrarlo subito e per riconoscere derive (validazione V7). Può essere usato come **board avversaria predefinita** (`setup.opponent.board`) di un'altra combo.

---

## 10. `engine` (facoltativo, replay esatto)

```jsonc
"engine": {
  "core": "@n1xx1/ocgcore-wasm@0.1.6",
  "scriptsCommit": "<commit di ProjectIgnis/CardScripts>",
  "cdbVersion": "147.89",        // versione del dataset carte usato
  "mode": "MR5",
  "seed": [ … ],                 // forma esatta dettata dai tipi del pacchetto (fase 5)
  "responses": [ "<base64>", … ] // risposte in ordine, con tipo del messaggio atteso
}
```
Se i valori non corrispondono alla versione corrente, l'app avvisa che il replay esatto non è garantito e usa i `steps` (che restano sempre validi).

---

## 11. Validazioni (eseguite alla creazione, all'import e al salvataggio)

| # | Regola |
|---|---|
| V1 | `format` e `v` presenti; `v` ≤ versione supportata (altrimenti sola lettura). |
| V2 | `id` dei passi unici in tutto il documento (linea principale + rami). |
| V3 | Ogni `uid` usato in `steps`/`setup`/`endboard` esiste in `cards`. |
| V4 | `branches[].condition.afterStep` e `rejoin` esistono e `rejoin` viene dopo `afterStep`. |
| V5 | I `group` sono contigui. |
| V6 | `deck.ydke`, se presente, coincide con `main/extra/side`. |
| V7 | Applicando `moves` si ottiene `endboard` (altrimenti avviso di deriva, non errore bloccante). |
| V8 | Le carte della mano `required` sono nel deck (in numero sufficiente). |
| V9 | `moves` coerenti con lo stato (nessuna carta spostata da dove non si trova). |

Gli errori bloccanti rifiutano l'import con messaggio chiaro; gli avvisi permettono l'import.

---

## 12. Versioni e migrazioni

- `v` è un intero. Modifiche **additive** (campi opzionali) non incrementano `v`. Modifiche incompatibili incrementano `v` e aggiungono una funzione pura `migrate_vN_to_vN+1`.
- In lettura si applicano le migrazioni in sequenza fino alla versione corrente; in scrittura si salva sempre l'ultima.
- Ogni migrazione ha test con un file di esempio della versione precedente (`tests/fixtures/combo/v1.json`, `v2.json`…).
- File con `v` superiore: sola lettura + avviso "aggiorna l'app".

---

## 13. Esempio minimo (codici fittizi tranne Ash Blossom = 14558127, verificato)

```json
{
  "format": "combolab.combo",
  "v": 1,
  "meta": {
    "id": "5b3f3e5e-0f1a-4f64-9a8b-0f4a6f5e0001",
    "title": { "it": "Apertura base", "en": "Basic opener" },
    "scope": "variant",
    "archetype": { "name": { "it": "Esempio", "en": "Example" } },
    "variant": { "name": { "it": "Standard", "en": "Standard" } },
    "rules": "TCG",
    "banlist": { "format": "TCG", "id": "2026.10" },
    "tags": ["demo"],
    "noteLang": ["it", "en"],
    "favorite": false,
    "createdAt": "2026-11-19T10:00:00Z",
    "updatedAt": "2026-11-19T10:00:00Z",
    "source": "manual"
  },
  "deck": { "main": [999000001, 999000001, 999000002], "extra": [999000003], "side": [] },
  "cards": { "u1": 999000001, "u2": 999000002, "u3": 999000003, "o1": 14558127 },
  "setup": {
    "first": true,
    "hand": { "required": ["u1", "u2"], "size": 5, "fill": "random" },
    "opponent": {
      "board": { "lp": 8000, "places": [] },
      "interrupts": [{ "uid": "o1", "mode": "ask", "target": "manual" }]
    }
  },
  "steps": [
    {
      "id": "s1", "action": "normalSummon", "card": "u1",
      "to": { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" },
      "moves": [{ "uid": "u1", "to": { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" }, "why": "summon" }],
      "note": { "it": "Evoca Normalmente.", "en": "Normal Summon." }
    },
    {
      "id": "s2", "action": "activate", "card": "u1",
      "effect": { "kind": "trigger", "index": 1 },
      "searched": ["u2"],
      "moves": [{ "uid": "u2", "to": { "loc": "hand" }, "why": "search" }],
      "note": { "it": "Cerca il pezzo chiave.", "en": "Search the key piece." }
    }
  ],
  "branches": [{
    "id": "b1",
    "title": { "it": "Se Ash sulla ricerca", "en": "If Ash on the search" },
    "condition": { "afterStep": "s2", "window": "activation", "opponent": { "code": 14558127, "effect": 1 } },
    "steps": [],
    "rejoin": null,
    "note": { "it": "La ricerca è negata: passa alla linea B.", "en": "Search is negated: go to line B." }
  }],
  "endboard": { "own": { "lp": 8000, "places": [{ "uid": "u1", "place": { "loc": "mzone", "seq": 2, "pos": "FACEUP_ATK" } }] } }
}
```
---

## 14. Come il formato alimenta ogni funzione

| Funzione | Cosa legge |
|---|---|
| **Guida** | `meta`, `setup.hand`, `steps` (azione/carta/nota), `branches`, `endboard`, badge di legalità (ricalcolato da `deck`+banlist). |
| **Replay / video** | `setup` + `steps[].moves` (+ `lp`, `counters`) → stati intermedi precalcolati; `endboard`. |
| **Testo** | `steps` (azione, carta nella lingua scelta, `targets`, `searched`, `note[lang]`). |
| **Testo compatto Discord** | Come sopra, sintassi abbreviata (§15). |
| **Impara** | `steps` (confronto 7.4), `group`, `branches`, `setup.interrupts`, `setup.hand.required`. |
| **Link / QR** | Il JSON minimizzato (senza `engine.responses`, `endboard` ricalcolabile, `ydke` derivato), deflate + base64url nel frammento `#`. |
| **Stats Lab** | `setup.hand.required` (carte necessarie → copertura), `deck`, `tags`. |

---

## 15. Esempi di export testuale

**Leggibile e numerato** (lingua scelta):
```
Apertura base — Esempio / Standard — TCG, banlist 2026.10 ✔ legale
Mano: Carta A, Carta B + 3 casuali · Giochi per primo
1. Evoca Normalmente Carta A.
2. Attiva l'effetto 1 di Carta A: cerca Carta B.
   ↳ Se l'avversario usa Ash Blossom: la ricerca è negata → vai alla linea B.
Board finale: Carta A (Zona Mostro 3)
```

**Compatto per Discord** (una riga per passo, abbreviazioni fisse per lingua):
```
**Apertura base** (TCG 2026.10) | Mano: A, B
1) NS A  2) Eff.1 A → cerca B  [Ash→B]
Fine: A
```

---

## 16. Altri formati gestiti dall'app (per l'import/export dei deck, non delle combo)

- **`.ydk`**: righe `#created by …`, `#main`, `#extra`, `!side`, un passcode per riga; compatibile con EDOPro, YGOPro, Omega e Dueling Nexus. L'import ignora commenti sconosciuti e righe vuote.
- **`ydke://`**: vedi §4.
- **Testo** ("3 Ash Blossom & Joyous Spring", IT o EN): abbinamento tollerante del nome → se ambiguo l'app chiede.
- **Codice deck YGO Omega**: da implementare **solo se** ne trovo documentazione verificabile; altrimenti l'app lo dichiara non supportato e suggerisce l'esportazione `.ydk` da Omega.
