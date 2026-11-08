import '../styles/globals.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../hooks/useAuth'
import { AppShell } from '../components/AppShell'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
})

export default function MyApp({ Component, pageProps }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      </AuthProvider>
    </QueryClientProvider>
  )
}
