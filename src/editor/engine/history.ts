/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { cloneAdjustments, DEFAULT_ADJUSTMENTS, type Adjustments } from './adjustments'
import { cloneFilters, DEFAULT_FILTERS, type FilterState } from './filters'
import { cloneTransform, DEFAULT_TRANSFORM, type TransformState } from './transforms'

/**
 * The complete, non-destructive description of an edit.
 *
 * Rendering is a pure function of the source pixels plus this state, so a
 * history entry is just a snapshot of it and undo/redo are cheap.
 */
export interface EditState {
  adjustments: Adjustments
  filters: FilterState
  transform: TransformState
}

export function createEditState(): EditState {
  return {
    adjustments: cloneAdjustments(DEFAULT_ADJUSTMENTS),
    filters: cloneFilters(DEFAULT_FILTERS),
    transform: cloneTransform(DEFAULT_TRANSFORM),
  }
}

export function cloneEditState(state: EditState): EditState {
  return {
    adjustments: cloneAdjustments(state.adjustments),
    filters: cloneFilters(state.filters),
    transform: cloneTransform(state.transform),
  }
}

export function editStatesEqual(a: EditState, b: EditState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A bounded undo/redo stack of edit states.
 *
 * The oldest entry is dropped once the limit is reached, so a long session
 * cannot grow the history without bound. The present state is always the entry
 * at `index`.
 */
export class EditHistory {
  private entries: EditState[]
  private index = 0

  constructor(
    initial: EditState = createEditState(),
    private readonly limit = 100,
  ) {
    this.entries = [cloneEditState(initial)]
  }

  /**
   * The current state, as an independent copy.
   *
   * Returning the stored entry directly would let a caller mutate a snapshot
   * in place, silently changing what undo and redo would restore.
   */
  get present(): EditState {
    return cloneEditState(this.entries[this.index]!)
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1
  }

  get size(): number {
    return this.entries.length
  }

  get position(): number {
    return this.index
  }

  /**
   * Push a new state, discarding any redo branch.
   *
   * A push equal to the present state is ignored, so dragging a slider back to
   * where it started does not add a no-op history step.
   */
  push(state: EditState): void {
    if (editStatesEqual(state, this.present)) {
      return
    }

    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(cloneEditState(state))

    if (this.entries.length > this.limit) {
      this.entries.shift()
    }

    this.index = this.entries.length - 1
  }

  undo(): EditState {
    if (this.canUndo) {
      this.index -= 1
    }
    return this.present
  }

  redo(): EditState {
    if (this.canRedo) {
      this.index += 1
    }
    return this.present
  }

  reset(state: EditState = createEditState()): void {
    this.entries = [cloneEditState(state)]
    this.index = 0
  }
}
