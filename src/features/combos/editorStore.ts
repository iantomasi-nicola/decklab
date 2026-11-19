import { create } from 'zustand'
import type { ComboDoc, Step, Uid } from '@/domain/combo/types'
import { addStep, applySetupDraft, moveStep, patchStep, removeCard, removeStep, toggleGroup, type Draft } from './model'

export type EditorMode = 'setup' | 'steps'

interface Snap { doc: ComboDoc; cursor: number }

interface EditorStore {
  doc: ComboDoc | null
  recordId: string | null
  cursor: number
  mode: EditorMode
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
    past: [],
    future: [],
    rev: 0,
    open: (doc, recordId) => set({ doc, recordId, cursor: doc.steps.length, mode: 'steps', past: [], future: [], rev: 0 }),
    close: () => set({ doc: null, recordId: null, past: [], future: [] }),
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
      const r = addStep(doc, cursor, d)
      commit(r.doc, r.cursor)
      return r.stepId
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
