import { useEffect } from 'react'

/**
 * What a reload would cost the operator right now.
 *
 * A new build reloads the page when its worker takes over (`reloadWhenWorkerTakesOver`), and an
 * installed console looks for one every time it comes back into view and every hour. Most of the
 * time nobody notices. The moment they would is an edit screen with changes not yet saved (the
 * persona sliders, a product or rate, a goal's wording, a notification being written), which a
 * reload wipes, and a save in flight, which a reload cuts off with no word on whether it landed.
 * Each screen reports that moment here, and the reload waits for it to pass.
 *
 * Unlike saoi-web's composer draft, a hold here survives the page being hidden: an operator
 * switching to the customer app mid-edit is coming back to finish it, and the new build is not
 * worth their edits. It arrives as soon as they save or discard.
 */

const holds = new Set<symbol>()
const listeners = new Set<() => void>()

/** Hold reloads until the returned function is called. Calling it twice is harmless. */
export function holdReload(): () => void {
  const hold = Symbol('reload hold')
  holds.add(hold)
  return () => {
    if (!holds.delete(hold)) return
    for (const listener of [...listeners]) listener()
  }
}

/** Whether a reload now would lose something. */
export function reloadBlocked(): boolean {
  return holds.size > 0
}

/** Reload now if nothing is held, otherwise as soon as nothing is. */
export function reloadWhenSafe(reload: () => void): void {
  if (!reloadBlocked()) {
    reload()
    return
  }

  const retry = (): void => {
    if (reloadBlocked()) return
    listeners.delete(retry)
    reload()
  }
  listeners.add(retry)
}

/**
 * Hold reloads while `active` is true; released when it turns false or on unmount.
 *
 * Screens pass `dirty || saving`: unsaved edits, or a save that has not answered yet.
 */
export function useReloadHold(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return holdReload()
  }, [active])
}
