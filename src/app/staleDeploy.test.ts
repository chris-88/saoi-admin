import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdates, isModuleLoadError, reloadWhenWorkerTakesOver } from '@/app/staleDeploy'
import { holdReload } from '@/app/reloadGate'

/*
 * The strings are the test.
 *
 * Each engine words a failed chunk fetch differently and none of them is an error subclass we
 * could check with `instanceof`, so matching the wording is all there is. If a browser changes
 * its phrasing the recovery silently stops working, and the only warning would be a customer
 * seeing an error page after a deploy — so the exact strings are pinned here.
 */
describe('isModuleLoadError', () => {
  it.each([
    ['Safari', 'Importing a module script failed.'],
    ['Chrome', 'Failed to fetch dynamically imported module: https://app.saoi.ie/assets/x.js'],
    ['Firefox', 'error loading dynamically imported module'],
    ['Vite CSS preload', 'Unable to preload CSS for /assets/index-abc.css'],
  ])('recognises %s', (_engine, message) => {
    expect(isModuleLoadError(new TypeError(message))).toBe(true)
  })

  it('leaves ordinary failures alone', () => {
    expect(isModuleLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isModuleLoadError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      false,
    )
  })

  it('does not stringify a bare object into a match', () => {
    expect(isModuleLoadError({ status: 404 })).toBe(false)
    expect(isModuleLoadError(null)).toBe(false)
  })
})

/** A document whose visibility the test moves. */
class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible'
  become(state: DocumentVisibilityState): void {
    this.visibilityState = state
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

describe('checkForUpdates', () => {
  const HOUR = 60 * 60_000
  const stops: (() => void)[] = []

  afterEach(() => {
    for (const stop of stops.splice(0)) stop()
    vi.useRealTimers()
  })

  function installed(update = vi.fn(() => Promise.resolve())) {
    const doc = new FakeDocument()
    const container = {
      getRegistration: () => Promise.resolve({ update }),
    } as unknown as ServiceWorkerContainer
    stops.push(checkForUpdates({ container, doc: doc as unknown as Document }))
    return { doc, update }
  }

  it('looks for a new build every hour while the console stays open', async () => {
    vi.useFakeTimers()
    const { update } = installed()

    await vi.advanceTimersByTimeAsync(HOUR - 1)
    expect(update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(HOUR * 2)
    expect(update).toHaveBeenCalledTimes(3)
  })

  it('looks again when the console comes back into view, not when it goes away', async () => {
    vi.useFakeTimers()
    const { doc, update } = installed()
    await vi.advanceTimersByTimeAsync(5 * 60_000)

    doc.become('hidden')
    await vi.advanceTimersByTimeAsync(0)
    expect(update).not.toHaveBeenCalled()

    doc.become('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not fetch the worker again for every flick between apps', async () => {
    vi.useFakeTimers()
    const { doc, update } = installed()

    // Within a minute of the load-time check: that check stands.
    doc.become('hidden')
    doc.become('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(update).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000)
    doc.become('hidden')
    doc.become('visible')
    doc.become('hidden')
    doc.become('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('shrugs off a failed check (offline) and tries again next time', async () => {
    vi.useFakeTimers()
    const update = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    installed(update)

    await vi.advanceTimersByTimeAsync(HOUR * 2)
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('stops when asked', async () => {
    vi.useFakeTimers()
    const { doc, update } = installed()
    for (const stop of stops.splice(0)) stop()

    await vi.advanceTimersByTimeAsync(HOUR * 2)
    doc.become('visible')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('reloadWhenWorkerTakesOver', () => {
  const releases: (() => void)[] = []
  afterEach(() => {
    for (const release of releases.splice(0)) release()
  })

  function page(hadController: boolean) {
    const container = new EventTarget() as unknown as ServiceWorkerContainer
    const reload = vi.fn()
    reloadWhenWorkerTakesOver({ container, reload, hadController })
    const takeOver = () => container.dispatchEvent(new Event('controllerchange'))
    return { reload, takeOver }
  }

  it('reloads into the new build when it takes over', () => {
    const { reload, takeOver } = page(true)
    takeOver()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('leaves a first visit alone', () => {
    const { reload, takeOver } = page(false)
    takeOver()
    expect(reload).not.toHaveBeenCalled()
  })

  it('waits for unsaved edits and for a save in flight', () => {
    const { reload, takeOver } = page(true)
    const edits = holdReload()
    const saving = holdReload()
    releases.push(edits, saving)

    takeOver()
    expect(reload).not.toHaveBeenCalled()

    saving()
    expect(reload).not.toHaveBeenCalled()
    edits()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
