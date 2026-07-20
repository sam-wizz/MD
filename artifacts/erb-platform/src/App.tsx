import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Auth from '@/pages/auth';
import { Route, Switch, Router as WouterRouter } from 'wouter';

// Signed-in surfaces are code-split so the public landing/auth bundle stays lean.
const Dashboard = lazy(() => import('@/pages/dashboard'));
const Onboarding = lazy(() => import('@/pages/onboarding'));
const OrdersNew = lazy(() => import('@/pages/orders-new'));
const OrderDetail = lazy(() => import('@/pages/order-detail'));
const Admin = lazy(() => import('@/pages/admin'));

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="animate-pulse text-sm font-bold text-slate-400">جارٍ التحميل...</div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={Auth} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/orders/new" component={OrdersNew} />
        <Route path="/orders/:id">{(params) => <OrderDetail id={params.id} />}</Route>
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
