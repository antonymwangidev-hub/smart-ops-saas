import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { RealtimeStatusProvider } from "@/contexts/RealtimeStatusContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PrivateRoute } from "@/components/PrivateRoute";
import { RoleRoute } from "@/components/RoleRoute";
import { createQueryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

/**
 * Lazy-load every page.
 *
 * ORIGINAL PROBLEM
 * ────────────────
 * All 30+ pages were eagerly imported at the top of App.tsx. Every import
 * adds to the initial JS parse cost — the browser had to parse PlatformAdmin,
 * Finance, StockTransfers etc. even if the user only ever visits the POS.
 * This inflated the "time to interactive" on low-end Android phones.
 *
 * FIX
 * ───
 * React.lazy() + Suspense. Each page becomes its own JS chunk (already split
 * by vite.config.ts manualChunks). The browser only downloads and parses a
 * page when the user first navigates to it. Subsequent visits use the cache.
 *
 * The fallback is a centred spinner — visible for ~100ms on first visit to
 * a route, then never again (chunk is cached).
 */

// ── Auth & Shell ────────────────────────────────────────────────────────
const Landing        = lazy(() => import("./pages/Landing"));
const Auth           = lazy(() => import("./pages/Auth"));
const Onboarding     = lazy(() => import("./pages/Onboarding"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const InviteAccept   = lazy(() => import("./pages/InviteAccept"));
const NotFound       = lazy(() => import("./pages/NotFound"));

// ── Daily operations ────────────────────────────────────────────────────
const POS            = lazy(() => import("./pages/POS"));
const DailySummary   = lazy(() => import("./pages/DailySummary"));
const CreditSales    = lazy(() => import("./pages/CreditSales"));
const Returns        = lazy(() => import("./pages/Returns"));

// ── Inventory ───────────────────────────────────────────────────────────
const Products       = lazy(() => import("./pages/Products"));
const Suppliers      = lazy(() => import("./pages/Suppliers"));
const Purchases      = lazy(() => import("./pages/Purchases"));
const StockTake      = lazy(() => import("./pages/StockTake"));
const StockTransfers = lazy(() => import("./pages/StockTransfers"));
const Batches       = lazy(() => import("./pages/Batches"));
const ExpiryReport  = lazy(() => import("./pages/ExpiryReport"));
const Reports       = lazy(() => import("./pages/Reports"));

// ── Business ────────────────────────────────────────────────────────────
const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Customers      = lazy(() => import("./pages/Customers"));
const Orders         = lazy(() => import("./pages/Orders"));
const Debtors        = lazy(() => import("./pages/Debtors"));
const Expenses       = lazy(() => import("./pages/Expenses"));
const Finance        = lazy(() => import("./pages/Finance"));
const Analytics      = lazy(() => import("./pages/Analytics"));
const Tasks          = lazy(() => import("./pages/Tasks"));
const Automations    = lazy(() => import("./pages/Automations"));
const Documents      = lazy(() => import("./pages/Documents"));
const Notifications  = lazy(() => import("./pages/Notifications"));
const AppSettings    = lazy(() => import("./pages/AppSettings"));
const WhatsAppInbox  = lazy(() => import("./pages/WhatsAppInbox"));
const WhatsAppTemplates = lazy(() => import("./pages/WhatsAppTemplates"));


// ── People ──────────────────────────────────────────────────────────────
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const Branches       = lazy(() => import("./pages/Branches"));
const Attendance     = lazy(() => import("./pages/Attendance"));

// ── Platform Admin ──────────────────────────────────────────────────────
const PlatformAdmin  = lazy(() => import("./pages/PlatformAdmin"));

// ── Singleton QueryClient — created once, outside component tree ─────────
// Placing it here (module scope) means it survives React hot-reload in dev
// and is never accidentally recreated on re-render.
const queryClient = createQueryClient();

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <OrgProvider>
                  <RealtimeStatusProvider>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      {/* ── Public ── */}
                      <Route path="/"               element={<Landing />} />
                      <Route path="/auth"            element={<Auth />} />
                      <Route path="/onboarding"      element={<Onboarding />} />
                      <Route path="/reset-password"  element={<ResetPassword />} />
                      <Route path="/invite/:token"   element={<InviteAccept />} />

                      {/* ── POS — all authenticated roles ── */}
                      <Route path="/pos"
                        element={<PrivateRoute><POS /></PrivateRoute>} />
                      <Route path="/daily-summary"
                        element={<PrivateRoute><DailySummary /></PrivateRoute>} />

                      {/* ── Staff+ ── */}
                      <Route path="/credit-sales"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><CreditSales /></RoleRoute></PrivateRoute>} />
                      <Route path="/returns"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Returns /></RoleRoute></PrivateRoute>} />
                      <Route path="/suppliers"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Suppliers /></RoleRoute></PrivateRoute>} />
                      <Route path="/purchases"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Purchases /></RoleRoute></PrivateRoute>} />
                      <Route path="/stock-take"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><StockTake /></RoleRoute></PrivateRoute>} />
                      <Route path="/expenses"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Expenses /></RoleRoute></PrivateRoute>} />
                      <Route path="/debtors"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Debtors /></RoleRoute></PrivateRoute>} />
                      <Route path="/products"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Products /></RoleRoute></PrivateRoute>} />
                      <Route path="/dashboard"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Dashboard /></RoleRoute></PrivateRoute>} />
                      <Route path="/customers"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Customers /></RoleRoute></PrivateRoute>} />
                      <Route path="/whatsapp"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><WhatsAppInbox /></RoleRoute></PrivateRoute>} />
                      <Route path="/whatsapp-templates"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><WhatsAppTemplates /></RoleRoute></PrivateRoute>} />


                      <Route path="/orders"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Orders /></RoleRoute></PrivateRoute>} />
                      <Route path="/tasks"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Tasks /></RoleRoute></PrivateRoute>} />
                      <Route path="/automations"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Automations /></RoleRoute></PrivateRoute>} />
                      <Route path="/documents"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Documents /></RoleRoute></PrivateRoute>} />
                      <Route path="/analytics"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Analytics /></RoleRoute></PrivateRoute>} />
                      <Route path="/notifications"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Notifications /></RoleRoute></PrivateRoute>} />
                      <Route path="/settings"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><AppSettings /></RoleRoute></PrivateRoute>} />
                      <Route path="/stock-transfers"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><StockTransfers /></RoleRoute></PrivateRoute>} />
                      <Route path="/batches"
                        element={<PrivateRoute><RoleRoute requiredRole="storekeeper"><Batches /></RoleRoute></PrivateRoute>} />
                      <Route path="/reports"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><Reports /></RoleRoute></PrivateRoute>} />
                      <Route path="/reports/expiry"
                        element={<PrivateRoute><RoleRoute requiredRole="staff"><ExpiryReport /></RoleRoute></PrivateRoute>} />

                      {/* ── Admin-only ── */}
                      <Route path="/finance"
                        element={<PrivateRoute><RoleRoute requiredRole="admin"><Finance /></RoleRoute></PrivateRoute>} />
                      <Route path="/staff"
                        element={<PrivateRoute><RoleRoute requiredRole="manager"><StaffManagement /></RoleRoute></PrivateRoute>} />
                      <Route path="/branches"
                        element={<PrivateRoute><RoleRoute requiredRole="admin"><Branches /></RoleRoute></PrivateRoute>} />

                      {/* ── All authenticated ── */}
                      <Route path="/attendance"
                        element={<PrivateRoute><Attendance /></PrivateRoute>} />
                      <Route path="/admin"
                        element={<PrivateRoute><PlatformAdmin /></PrivateRoute>} />

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  </RealtimeStatusProvider>
                </OrgProvider>
              </AuthProvider>
            </BrowserRouter>
          </CurrencyProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
