# Sistema audio (src/features/sound)

Suoni sintetizzati con WebAudio (nessun file audio). Tonalità unica: La minore pentatonica. Ogni suono dura 30-400 ms.

## API
```ts
import { playSound, soundForAction, useSound, soundEngine } from '@/features/sound'

playSound('summonNormal')            // fire-and-forget, ritorna true se schedulato
playSound('chainLink', linkNumber)   // altezza crescente col numero d'anello (1..12)
const name = soundForAction(step)    // SoundName | null (da action/method/moves[0].why)
```
- `useSound()` -> `{ play, playForStep(step), preview(name), soundForAction, settings }`. `playForStep` usa `step.chain.link` per `chainLink`.
- `soundEngine.install()` va chiamato una volta all'avvio (es. in App): sblocca l'AudioContext al primo gesto (pointerdown/touchend/keydown/click) e sospende/riprende con la visibilità della pagina. Senza `install()` il contesto nasce comunque al primo `play` fatto dentro un gesto utente.
- Nomi: summonNormal/Set/Special, summonFusion/Synchro/Xyz/Link/Ritual/Pendulum, activate, chainLink, chainResolve, negate, destroy, sendToGY, banish, draw, search, discard, flip, positionChange, equip, attack, damage, phaseChange, targetSelect, targetConfirm, stepNext, stepPrev, uiTap, uiToggle, uiOpen, uiClose, error, undo, redo, comboComplete.
- Categorie: `game` (azioni di gioco), `ui` (interfaccia: target, step replay, ui*), `feedback` (error, undo, redo, comboComplete).

## Comportamento
Un solo AudioContext; schedulazione su `currentTime`; master -> compressore -> limiter; riverbero convolver sintetico; max 20 voci; dedup (stesso nome+argomento entro 45 ms) e throttle (max 6 suoni / 100 ms); niente audio a pagina nascosta. Impostazioni in `localStorage` `combolab.sound` (volume, muted, categorie, vibrazione), store zustand `useSoundSettings`. La vibrazione (`navigator.vibrate`) è un'impostazione separata, spenta di default, indipendente dal mute.

## Integrazione consigliata
- Editor/replay: al commit di un passo `playForStep(step)`; replay avanti/indietro `playSound('stepNext'|'stepPrev')`; fine combo `comboComplete`; annulla/ripeti `undo`/`redo`; azione non valida `error`; selezione bersaglio `targetSelect`/`targetConfirm`; pannelli `uiOpen`/`uiClose`.
- Replay veloce/auto-play: il throttle protegge, ma preferire un suono per passo.
- Impostazioni: `SoundSection` già montata in SettingsPage. Pagina di prova: `tests/harness/sound.html`.
