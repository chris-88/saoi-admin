import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PRESETS } from '@llm/persona.ts'
import { reloadBlocked } from '@/app/reloadGate'
import { adminApi } from '@/admin/adminClient'
import { PersonaControls } from '@/admin/PersonaControls'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPersona() {
  const queries = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queries}>
      <PersonaControls
        persona={{ preset: 'default', sliders: PRESETS.default }}
        onChanged={() => undefined}
      />
    </QueryClientProvider>,
  )
}

/*
 * The persona screen is the edit screen a new build is most likely to land on mid-change: the
 * sliders do not auto-save. A reload over moved sliders would put them back without a word.
 */
describe('PersonaControls and a new build', () => {
  it('holds a reload while sliders are moved and not applied, and lets go on reset', () => {
    renderPersona()
    expect(reloadBlocked()).toBe(false)

    const [length] = screen.getAllByRole('slider')
    if (!length) throw new Error('no slider')
    fireEvent.keyDown(length, { key: 'ArrowRight' })
    expect(reloadBlocked()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(reloadBlocked()).toBe(false)
  })

  it('holds a reload while a save is in flight, and lets go once it answers', async () => {
    let answer: (value: unknown) => void = () => undefined
    vi.spyOn(adminApi, 'setPersona').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    const view = renderPersona()

    fireEvent.click(screen.getByRole('button', { name: 'concise' }))
    await waitFor(() => {
      expect(reloadBlocked()).toBe(true)
    })

    answer({ ok: true })
    await waitFor(() => {
      expect(reloadBlocked()).toBe(false)
    })
    view.unmount()
  })

  it('lets go when the screen is left', () => {
    const view = renderPersona()
    const [slider] = screen.getAllByRole('slider')
    if (!slider) throw new Error('no slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(reloadBlocked()).toBe(true)

    view.unmount()
    expect(reloadBlocked()).toBe(false)
  })
})
