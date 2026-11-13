import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { holdReload, reloadBlocked, reloadWhenSafe, useReloadHold } from '@/app/reloadGate'

const releases: (() => void)[] = []
const hold = (): (() => void) => {
  const release = holdReload()
  releases.push(release)
  return release
}

afterEach(() => {
  for (const release of releases.splice(0)) release()
})

describe('reloadWhenSafe', () => {
  it('reloads at once when nothing is held', () => {
    const reload = vi.fn()
    reloadWhenSafe(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for unsaved edits to be saved or dropped', () => {
    const reload = vi.fn()
    const release = hold()

    reloadWhenSafe(reload)
    expect(reload).not.toHaveBeenCalled()

    release()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for every hold, not the first released, and reloads only once', () => {
    const reload = vi.fn()
    const edits = hold()
    const saving = hold()

    reloadWhenSafe(reload)
    saving()
    expect(reload).not.toHaveBeenCalled()
    edits()
    expect(reload).toHaveBeenCalledTimes(1)

    // A later hold and release is not a second reload.
    hold()()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('treats a second release of the same hold as nothing', () => {
    const reload = vi.fn()
    const first = hold()
    hold()

    reloadWhenSafe(reload)
    first()
    first()
    expect(reloadBlocked()).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('useReloadHold', () => {
  it('holds while active and lets go when it turns off or unmounts', () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => {
        useReloadHold(active)
      },
      { initialProps: { active: false } },
    )
    expect(reloadBlocked()).toBe(false)

    rerender({ active: true })
    expect(reloadBlocked()).toBe(true)

    rerender({ active: false })
    expect(reloadBlocked()).toBe(false)

    rerender({ active: true })
    unmount()
    expect(reloadBlocked()).toBe(false)
  })
})
