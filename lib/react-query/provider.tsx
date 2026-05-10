'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

// Singleton QueryClient per browser instance. Created lazily inside state so
// React's strict-mode double-mount in dev doesn't double-instantiate the
// cache.
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Keep cache around for 5 minutes — country/city lists rarely
        // change within a session.
        staleTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
