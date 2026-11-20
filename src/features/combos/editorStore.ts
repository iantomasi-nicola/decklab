import { create } from 'zustand'
import type { ComboDoc, Step, Uid } from '@/domain/combo/types'
import { addStep, applySetupDraft, isOwnHandAdd, moveStep, patchStep, removeCard, removeStep, setHand, toggleGroup, type Draft, type HandMode } from './model'

export type EditorMode = 'setup' | 'steps'

interface Snap { doc: ComboDoc; cursor: number }

interface EditorStore {
  doc: ComboDoc | null
  recordId: string | null
  cursor: number
  mode: EditorMode
  /** carta messa in mano dopo che esistono già passi: l'utente sceglie "mano iniziale" o "come passo" */
  handAsk: Draft | null
  past: Snap[]
  future: Snap[]
  /** cresce a ogni modifica al documento (serve all'autosalvataggio) */
  rev: number
  open: (doc: ComboDoc, recordId: string) => void
  close: () => void
  setMode: (m: EditorMode) => void
  setCursor: (n: number) => void
  /** Modifica generica (una voce di annulla/ripeti). */
  edit: (fn: (doc: ComboDoc, cursor: number) => { doc: ComboDoc; cursor?: number } | null) => boolean
  /** Un rilascio/azione sul campo: nel manuale crea un passo, nella configurazione modifica lo stato iniziale. */
  apply: (d: Draft) => string | null
  /** Risposta alla scelta di `handAsk`. */
  resolveHandAsk: (choice: 'setup' | 'step' | 'cancel') => string | null
  /** Mano di partenza (unica via per Setup, Avvia e creazione): ritorna gli uid che i passi usano ancora e che non si sono potuti togliere. */
  setHand: (o: { codes: readonly number[]; mode: HandMode; size?: number }) => string[]
  /** Aggiornamento silenzioso (modalità automatica): niente cronologia, cursore alla fine; l'annulla è quello del motore. */
  sync: (fn: (doc: ComboDoc) => ComboDoc) => void
  patchStep: (id: string, patch: Partial<Step>) => void
  moveStep: (id: string, dir: -1 | 1) => void
  removeStep: (id: string) => void
  toggleGroup: (id: string) => void
  removeCard: (uid: Uid) => boolean
  undo: () => void
  redo: () => void
}

const clamp = (n: number, doc: ComboDoc) => Math.max(0, Math.min(n, doc.steps.length))

export const useEditor = create<EditorStore>((set, get) => {
  const commit = (next: ComboDoc, cursor: number) => {
    const s = get()
    if (!s.doc) return
    set({ doc: next, cursor: clamp(cursor, next), past: [...s.past, { doc: s.doc, cursor: s.cursor }], future: [], rev: s.rev + 1 })
  }
  return {
    doc: null,
    recordId: null,
    cursor: 0,
    mode: 'steps',
    handAsk: null,
    past: [],
    future: [],
    rev: 0,
    open: (doc, recordId) => set({ doc, recordId, cursor: doc.steps.length, mode: 'steps', handAsk: null, past: [], future: [], rev: 0 }),
    close: () => set({ doc: null, recordId: null, handAsk: null, past: [], future: [] }),
    setMode: (mode) => set({ mode }),
    setCursor: (n) => {
      const d = get().doc
      if (d) set({ cursor: clamp(n, d) })
    },
    edit: (fn) => {
      const { doc, cursor } = get()
      if (!doc) return false
      const r = fn(doc, cursor)
      if (!r) return false
      commit(r.doc, r.cursor ?? cursor)
      return true
    },
    apply: (d) => {
      const { doc, cursor, mode } = get()
      if (!doc) return null
      if (mode === 'setup') {
        commit(applySetupDraft(doc, d), cursor)
        return null
      }
      // una carta messa in mano PRIMA del primo passo è una carta di setup (mai persa passando ad Automatica/Avvia);
      // con passi già presenti si chiede dove metterla
      if (isOwnHandAdd(d)) {
        if (doc.steps.length === 0) {
          commit(applySetupDraft(doc, d), cursor)
          return null
        }
        set({ handAsk: d })
        return null
      }
      const r = addStep(doc, cursor, d)
      commit(r.doc, r.cursor)
      return r.stepId
    },
    resolveHandAsk: (choice) => {
      const { doc, cursor, handAsk } = get()
      set({ handAsk: null })
      if (!doc || !handAsk || choice === 'cancel') return null
      if (choice === 'setup') {
        commit(applySetupDraft(doc, handAsk), cursor)
        return null
      }
      const r = addStep(doc, cursor, handAsk)
      commit(r.doc, r.cursor)
      return r.stepId
    },
    setHand: (o) => {
      const { doc, cursor } = get()
      if (!doc) return []
      const r = setHand(doc, o)
      if (r.doc !== doc) commit(r.doc, cursor)
      return r.blocked
    },
    sync: (fn) => {
      const s = get()
      if (!s.doc) return
      const next = fn(s.doc)
      set({ doc: next, cursor: next.steps.length, rev: s.rev + 1 })
    },
    patchStep: (id, patch) => {
      const doc = get().doc
      if (doc) commit(patchStep(doc, id, patch), get().cursor)
    },
    moveStep: (id, dir) => {
      const { doc, cursor } = get()
      if (!doc) return
      const i = doc.steps.findIndex((s) => s.id === id)
      const next = moveStep(doc, id, dir)
      if (next !== doc) commit(next, i + 1 === cursor ? cursor + dir : i === cursor ? cursor - dir : cursor)
    },
    removeStep: (id) => {
      const { doc, cursor } = get()
      if (!doc) return
      const i = doc.steps.findIndex((s) => s.id === id)
      commit(removeStep(doc, id), i < cursor ? cursor - 1 : cursor)
    },
    toggleGroup: (id) => {
      const doc = get().doc
      if (doc) commit(toggleGroup(doc, id), get().cursor)
    },
    removeCard: (uid) => {
      const { doc, cursor } = get()
      if (!doc) return false
      const next = removeCard(doc, uid)
      if (!next) return false
      commit(next, cursor)
      return true
    },
    undo: () => {
      const s = get()
      const prev = s.past[s.past.length - 1]
      if (!prev || !s.doc) return
      set({ doc: prev.doc, cursor: prev.cursor, past: s.past.slice(0, -1), future: [{ doc: s.doc, cursor: s.cursor }, ...s.future], rev: s.rev + 1 })
    },
    redo: () => {
      const s = get()
      const next = s.future[0]
      if (!next || !s.doc) return
      set({ doc: next.doc, cursor: next.cursor, past: [...s.past, { doc: s.doc, cursor: s.cursor }], future: s.future.slice(1), rev: s.rev + 1 })
    },
  }
})

// solo sviluppo/test: permette ai test di misurare i tempi di rendering senza passare dall'interfaccia
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __comboStore?: typeof useEditor }).__comboStore = useEditor
