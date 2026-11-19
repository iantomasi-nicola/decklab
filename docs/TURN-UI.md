# Stato del turno e indicatori — API di integrazione

Tutto è in **file nuovi**, pronto da collegare a editor, guida e replay. Pagina di prova: `tests/harness/turn.html` (`?long=1` combo da 60 passi, `?step=N`, `?pick=N` apre la scelta bersagli, `?gray=1` scala di grigi). Test: `src/domain/combo/turn.test.ts`, `targetPick.test.ts`, `src/features/turn/strings.test.ts`, `tests/e2e/turn-ui.spec.ts` (matrice 375/768/1024/1440 × scuro/chiaro × it/en).

## 1. Logica pura — `src/domain/combo/turn.ts`
```ts
turnStateAt(doc, stepIndex, options?, branchId?): TurnState   // -1 = stato iniziale (come stateAt)
turnTimeline(doc, options?, branchId?): TurnState[]           // out[k] = dopo k passi (stepIndex = k-1): una sola chiamata, poi lookup O(1)
optTotalInDoc(doc): number                                    // effetti OPT distinti della combo (per "usati su totali")
effectAvailability(ts, { uid, code?, index }) / usesOfCard(ts, uid, code?)
legalTransitions(phase) / canTransition(from, to) / phaseWarnings(doc)
```
`TurnState`: `phase`, `phaseTransitions` (valide da qui, `kind: 'next'|'skip'`), `phaseLog`, `turn`, `normalSummonUsed` (+ `normalSummon{uid,code,stepIndex,type}`, `tributeSummonUsed`, `setMonsterUsed`, `normalSummonsMax/Done`), `flipSummons`, `specialSummons`, `specialByMethod`, `pendulumSummonUsed`, `optUses[]` / `optUsedCount` / `optOverused[]`, `activations{activation,ignition,quick,trigger,continuous,other}`, `attacked[]` / `attackCounts`, `counters` / `counterTotal`, `log[]` (promemoria in ordine), `turnEnded`.

Convenzioni: fase iniziale **Main 1** (opzione `startPhase`); `endTurn` chiude il turno, il passo successivo apre il turno +1 (contatori azzerati). Fase del passo = `step.phase`; `enterPhase` senza fase = successiva; `attack` da Main = Battle. Transizioni: Draw→Standby (o Main 1), Standby→Main 1, Main 1→Battle|Main 2|End, Battle→Main 2|End, Main 2→End.
**OPT**: il formato non dice quali effetti lo siano. Default: ignition/trigger/quick con `effect.index`, per copia (`uid#indice`). Si può precisare nel passo con `x.opt`: `false` (non OPT), `true`/`'card'` (per copia), `'name'` (per nome carta, unisce le copie dello stesso passcode). Un secondo uso dello stesso effetto va in `optOverused` (chip "Ripetuti"). `x.extraNormalSummon: n` concede n Normali in più.

`src/domain/combo/targetPick.ts`: reducer puro della scelta (`initPick`, `togglePick`, `undoPick`, `canConfirmPick`, `pickOrder`, `pickCounter`, `stepCandidate`).

## 2. Icone — `src/ui/gameIcons/`
```tsx
import { GameIcon, EffectBadge, iconForAction, iconForEffect, PHASE_ICON } from '@/ui/gameIcons'
<GameIcon name="fusion" size={24} />                // tratto 1,75px a ogni dimensione, currentColor; label a11y it/en automatica, label={false} = decorativa
<EffectBadge kind="ignition" index={1} size="md" /> // kind: ignition|quick|trigger|continuous|activation|chain ("chain": index = anello N)
```
45 icone (`ICON_NAMES`): tipi di effetto, negate/destroy/search/draw/discard/toGY/banish/toHand/toDeck, normal/tribute/set/flip/special, fusion/synchro/xyz/link/ritual/pendulum, posAtk/posDef/posFacedown, counter, equip, attack, 6 fasi, once/check/target. Badge = colore + **forma** (cerchio, esagono, rombo, quadrato arrotondato, carta, anello) + icona: distinguibili in scala di grigi. `iconForAction(step.action, step.method)` e `iconForEffect(step.effect.kind)` mappano il formato combo. Colori: variabili `--k-*` in `gameIcons.css` (scuro/chiaro, contrasto AA).

## 3. Componenti — `src/features/turn/`
```tsx
import { TurnBar, TurnStatus, CardOptMarks, OncePerTurnMark, TargetPickerOverlay } from '@/features/turn'
const ts = turnTimeline(doc)[stepIndex + 1]            // calcola la timeline una volta (useMemo)

<TurnBar phase={ts.phase} transitions={ts.phaseTransitions} turn={ts.turn} onPhaseChange={(to, kind) => …} />
<TurnStatus turn={ts} optTotal={optTotalInDoc(doc)} cardName={(uid) => …} onJumpToStep={(i) => …} />
<CardOptMarks turn={ts} uid={uid} code={doc.cards[uid]} size="sm" />   // posizionala tu sull'angolo della carta (inline, 20/24px)
<OncePerTurnMark state="used" index={1} count={1} />                    // singola marcatura
```
- **TurnBar**: toolbar con 6 pulsanti ≥44px (56px su telefono: icona sopra, etichetta sotto; in riga con container ≥700px). Fase corrente piena (`aria-current="step"`), raggiungibili con bordo, passate attenuate, le altre disabilitate; `free` abilita ogni fase. Tastiera: frecce/Home/End spostano il focus; scorciatoie globali **Alt+1…6** (salta) e **Alt+N** (successiva), disattivabili con `shortcuts={false}`.
- **TurnStatus**: chip "Normale fatta/disponibile", "OPT n su m usati", "Ripetuti", Pendulum, Speciali, attaccanti, segnalini + pulsante "Già fatto in questo turno" (n) che apre l'elenco (icona, azione, carta, tag "una volta per turno"/"usato di nuovo", n. passo; scorrevole e con `content-visibility` per le combo lunghe). Con `onJumpToStep` le righe saltano al passo.
- **OncePerTurnMark**: disponibile = anello "1"; usato = disco pieno con spunta; ripetuto = disco di avviso "×N"; pip con il numero effetto; etichetta a11y completa.
- **TargetPickerOverlay**: portale a tutto schermo; **non tocca il campo**, legge la posizione degli elementi `data-card="uid"` (come `Field.tsx`; personalizzabile con `findElement`). Candidati = buco nello scuro + anello con respiro sobrio, scelte con anello pieno e numero d'ordine (o spunta se max=1); pannello con "Scegli N di M" (o "da a"), progresso, Annulla/Conferma da 52px, lato alto/basso scelto per coprire meno candidati. Candidati non visibili (Cimitero, Extra…) compaiono come pulsanti nel pannello. Mouse/touch/tastiera: frecce = muovi, Spazio/Invio = scegli, Backspace = togli ultima, Ctrl+Invio = conferma, Esc = annulla; focus intrappolato e ripristinato; annunci `aria-live`.
```tsx
{picking && <TargetPickerOverlay candidates={uids} min={1} max={2} title="Effetto 1" cardName={nameOf}
   onConfirm={(sel) => …} onCancel={() => …} confirmOnPick={false} />}
```

## 4. Testi
`src/features/turn/strings.ts` (it/en, `useTurnT()`) e `src/ui/gameIcons/labels.ts` contengono i testi: sono volutamente fuori da `it.json/en.json` per non creare conflitti; chiavi e segnaposto sono già nel formato JSON e un test ne verifica la parità it/en. Si possono spostare nei JSON senza cambiare l'API.

## 5. Integrazione suggerita (senza toccare Field/editor)
1. Editor/replay/guida: `const tl = useMemo(() => turnTimeline(doc), [doc])`; sopra il campo `TurnBar` + `TurnStatus` in un pannello riducibile (il campo resta prioritario); `CardOptMarks` nell'angolo delle carte in `Field`.
2. Scelta bersagli: apri `TargetPickerOverlay` quando un passo richiede di scegliere; con `confirmOnPick` per il flusso rapido.
3. Elenco passi: `iconForAction` + `EffectBadge` per ogni riga.

## 6. Limiti noti
- L'icona del Pendulum e il simbolo di "Trigger" sono i più astratti: da riguardare dopo i test manuali.
- Il riconoscimento OPT è euristico finché i dati carta non dichiarano l'effetto (`x.opt` nei passi).
- Il pannello di scelta usa coordinate della viewport: se il campo è dentro un contenitore che scorre, l'overlay si riallinea ogni frame.
