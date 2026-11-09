import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoute,
  createRouter,
  createRootRoute,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router';
import { AuthProvider } from '../hooks/useAuth';
import { AppShell } from '../components/AppShell';
import IndexPage from './pages/index';
import LoginPage from './pages/login';
import PaymentsPage from './pages/payments';
import SettingsPage from './pages/settings';
import CreatePaymentPage from './pages/create-payment';
import CheckoutPage from './pages/checkout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

const RootLayout = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </AuthProvider>
    </QueryClientProvider>
  );
};

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/payments',
  component: PaymentsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const createPaymentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/create-payment',
  component: CreatePaymentPage,
});

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/checkout/$paymentId',
  component: CheckoutPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  paymentsRoute,
  settingsRoute,
  createPaymentRoute,
  checkoutRoute,
]);

export const router = createRouter({ routeTree });

export default function App() {
  return <RouterProvider router={router} />;
}
