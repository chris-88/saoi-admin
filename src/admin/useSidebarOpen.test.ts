import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSidebarOpen } from '@/admin/useSidebarOpen'

/** A viewport `width` wide: a `max-width` query matches when the width is within it. */
function atWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)?.[1]
    return {
      matches: max !== undefined && width <= Number(max),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('the sidebar on a tablet', () => {
  it('starts as the icon rail under 1024px and remembers the viewer opening it', () => {
    atWidth(820)
    const first = renderHook(() => useSidebarOpen())
    expect(first.result.current[0]).toBe(false)
    act(() => first.result.current[1](true))
    expect(first.result.current[0]).toBe(true)
    first.unmount()

    const again = renderHook(() => useSidebarOpen())
    expect(again.result.current[0]).toBe(true)
    act(() => again.result.current[1](false))
    again.unmount()
    expect(renderHook(() => useSidebarOpen()).result.current[0]).toBe(false)
  })

  it('starts open at 1024px and up, whatever was chosen on a tablet', () => {
    window.localStorage.setItem('saoi.admin.sidebar.narrowOpen', 'false')
    atWidth(1180)
    const { result } = renderHook(() => useSidebarOpen())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem('saoi.admin.sidebar.narrowOpen')).toBe('false')
  })
})
