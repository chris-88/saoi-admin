import { useCallback, useState } from 'react'
import { useIsNarrow } from '@/lib/useIsNarrow'

/** `lg`: under it (a tablet, the iPad PWA in portrait) the sidebar starts as its icon rail. */
const WIDE_FROM_PX = 1024
const KEY = 'saoi.admin.sidebar.narrowOpen'

/**
 * Whether the console's sidebar is expanded, for `SidebarProvider`'s `open` and `onOpenChange`.
 *
 * At 1024px and up it starts open, as it always has. Under that it starts as the icon rail, so a
 * tablet's screen goes to the content (an open sidebar left an 820px iPad a 530px pane), and the
 * viewer's own choice there is kept in `localStorage`. Under 768px the sidebar is a drawer with
 * its own state, so this does not reach it. Turning an iPad crosses 1024px, and each width keeps
 * its own state.
 */
export function useSidebarOpen(): readonly [boolean, (open: boolean) => void] {
  const narrow = useIsNarrow(WIDE_FROM_PX)
  const [narrowOpen, setNarrowOpen] = useState(readNarrowOpen)
  const [wideOpen, setWideOpen] = useState(true)

  const setOpen = useCallback(
    (open: boolean) => {
      if (!narrow) {
        setWideOpen(open)
        return
      }
      setNarrowOpen(open)
      try {
        window.localStorage.setItem(KEY, String(open))
      } catch {
        // Private browsing and blocked storage both throw. The choice still holds this session.
      }
    },
    [narrow],
  )

  return [narrow ? narrowOpen : wideOpen, setOpen]
}

function readNarrowOpen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}
