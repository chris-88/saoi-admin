import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminConsole } from '@/admin/AdminConsole'

describe('the console', () => {
  it('asks for a sign-in before showing anything (§37)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <AdminConsole />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    // The server checks admin status on every call regardless, but the console must not present
    // controls to someone who has not signed in.
    expect(screen.queryByText(/rebuild the sample customer/i)).not.toBeInTheDocument()
  })
})
