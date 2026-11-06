/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { EditHistory, createEditState } from '../../src/editor/engine/history'

describe('EditHistory', () => {
  it('starts with a single entry and nothing to undo or redo', () => {
    const history = new EditHistory()
    expect(history.size).toBe(1)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('pushes a new state and enables undo', () => {
    const history = new EditHistory()
    const next = createEditState()
    next.adjustments.brightness = 20

    history.push(next)
    expect(history.size).toBe(2)
    expect(history.canUndo).toBe(true)
    expect(history.present.adjustments.brightness).toBe(20)
  })

  it('ignores a push equal to the present state', () => {
    const history = new EditHistory()
    history.push(createEditState())
    expect(history.size).toBe(1)
  })

  it('undoes and redoes', () => {
    const history = new EditHistory()
    const next = createEditState()
    next.adjustments.contrast = 40
    history.push(next)

    expect(history.undo().adjustments.contrast).toBe(0)
    expect(history.canRedo).toBe(true)
    expect(history.redo().adjustments.contrast).toBe(40)
  })

  it('discards the redo branch when a new state is pushed', () => {
    const history = new EditHistory()
    const first = createEditState()
    first.adjustments.brightness = 10
    history.push(first)

    history.undo()
    expect(history.canRedo).toBe(true)

    const second = createEditState()
    second.adjustments.brightness = 30
    history.push(second)

    expect(history.canRedo).toBe(false)
    expect(history.present.adjustments.brightness).toBe(30)
  })

  it('drops the oldest entry past the limit', () => {
    const history = new EditHistory(createEditState(), 3)
    for (let i = 1; i <= 5; i += 1) {
      const state = createEditState()
      state.adjustments.brightness = i
      history.push(state)
    }

    expect(history.size).toBe(3)
    // The present is the newest state.
    expect(history.present.adjustments.brightness).toBe(5)
  })

  it('resets to a single entry', () => {
    const history = new EditHistory()
    const next = createEditState()
    next.adjustments.exposure = 25
    history.push(next)
    history.reset()

    expect(history.size).toBe(1)
    expect(history.canUndo).toBe(false)
    expect(history.present.adjustments.exposure).toBe(0)
  })

  it('returns a stable snapshot when the pushed state is mutated afterwards', () => {
    const history = new EditHistory()
    const next = createEditState()
    next.adjustments.brightness = 20
    history.push(next)

    // The history must not alias the caller's object.
    next.adjustments.brightness = 99
    expect(history.present.adjustments.brightness).toBe(20)
  })
})
