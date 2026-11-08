/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

// deepmerge <= 4.3.1 lets a `__proto__` key in the source object set the
// prototype of the object merge() returns (GHSA-gcqx-w48m-w2h4). The advisory
// ships no fixed release, so the package is patched locally; these tests fail
// if that patch is dropped.
//
// The exploit needs a target shape that the library's own propertyIsUnsafe()
// guard misses: a null-prototype object, or a null/primitive placeholder on the
// target. Both are the shapes the advisory names.
import merge from 'deepmerge'

const MALICIOUS = JSON.parse('{"__proto__": {"isAdmin": true}}') as Record<string, unknown>

describe('deepmerge prototype-poisoning patch (GHSA-gcqx-w48m-w2h4)', () => {
  it('does not let a __proto__ key set the prototype of a null-placeholder target', () => {
    const merged = merge({ session: null }, { session: MALICIOUS }) as {
      session: Record<string, unknown>
    }
    expect(Object.getPrototypeOf(merged.session)).toBe(Object.prototype)
    expect(merged.session.isAdmin).toBeUndefined()
  })

  it('does not let a __proto__ key set the prototype of a null-prototype target', () => {
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

  it('does not let a __proto__ key inside an array element poison the clone', () => {
    const merged = merge({ list: [] }, JSON.parse('{"list": [{"__proto__": {"isAdmin": true}}]}')) as {
      list: Record<string, unknown>[]
    }
    expect(Object.getPrototypeOf(merged.list[0])).toBe(Object.prototype)
    expect(merged.list[0].isAdmin).toBeUndefined()
  })

  it('never touches the global Object.prototype', () => {
    merge({}, MALICIOUS)
    merge(Object.create(null), MALICIOUS)
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('still merges ordinary objects as before', () => {
    expect(merge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } })
    expect(merge({ a: 1 }, { a: 0 }).a).toBe(0)
    expect(merge({}, { foo: 'bar' }).foo).toBe('bar')
  })
})
