/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

// deepmerge <= 4.3.1 lets a `__proto__` key in the source set the prototype of
// the object merge() returns (GHSA-gcqx-w48m-w2h4). Its own guard only catches
// the key when the target is a plain object, so the exploit needs a target shape
// the guard misses: a null-prototype object, or a null/primitive placeholder.
// The advisory has no fixed release, so the package is patched locally and the
// tests below fail if that patch is dropped.
import merge from 'deepmerge'

const MALICIOUS = JSON.parse('{"__proto__": {"isAdmin": true}}') as Record<string, unknown>

describe('deepmerge prototype-poisoning patch (GHSA-gcqx-w48m-w2h4)', () => {
  it('rejects a __proto__ key merged into a null-placeholder target', () => {
    const merged = merge({ session: null }, { session: MALICIOUS }) as {
      session: Record<string, unknown>
    }
    expect(Object.getPrototypeOf(merged.session)).toBe(Object.prototype)
    expect(merged.session.isAdmin).toBeUndefined()
    // The poisoning stays on the returned object; the global prototype is never
    // touched, which is what makes it silent.
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('rejects a __proto__ key merged into a null-prototype target', () => {
    const merged = merge(Object.create(null), MALICIOUS)
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(merged.isAdmin).toBeUndefined()
  })

  it('does not copy an own __proto__ key off the target', () => {
    const poisoned = JSON.parse('{"__proto__": {"isAdmin": true}, "debug": false}')
    const merged = merge(poisoned, { verbose: true }) as Record<string, unknown>
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(merged.isAdmin).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(merged, '__proto__')).toBe(false)
    // Legitimate keys on both sides still merge.
    expect(merged.debug).toBe(false)
    expect(merged.verbose).toBe(true)
  })

  it('still merges ordinary objects', () => {
    expect(merge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } })
    expect(merge({ a: 1 }, { a: 0 }).a).toBe(0)
    expect(merge({}, { foo: 'bar' }).foo).toBe('bar')
  })
})
