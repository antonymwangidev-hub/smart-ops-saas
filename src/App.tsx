import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PrivateRoute } from "@/components/PrivateRoute";
import { RoleRoute } from "@/components/RoleRoute";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import Tasks from "./pages/Tasks";
import Automations from "./pages/Automations";
import Products from "./pages/Products";
import POS from "./pages/POS";
import DailySummary from "./pages/DailySummary";
import CreditSales from "./pages/CreditSales";
import Returns from "./pages/Returns";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import Expenses from "./pages/Expenses";
import Debtors from "./pages/Debtors";
import Finance from "./pages/Finance";
import Branches from "./pages/Branches";
import StockTransfers from "./pages/StockTransfers";
import Attendance from "./pages/Attendance";
import StaffManagement from "./pages/StaffManagement";
import ResetPassword from "./pages/ResetPassword";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import AppSettings from "./pages/AppSettings";
import Documents from "./pages/Documents";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import PlatformAdmin from "./pages/PlatformAdmin";
import StockTake from "./pages/StockTake";
import InviteAccept from "./pages/InviteAccept";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CurrencyProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invite/:token" element={<InviteAccept />} />
              {/* POS — all roles */}
              <Route path="/pos" element={<PrivateRoute><POS /></PrivateRoute>} />
              <Route path="/daily-summary" element={<PrivateRoute><DailySummary /></PrivateRoute>} />
              {/* Staff+ routes */}
              <Route path="/credit-sales" element={<PrivateRoute><RoleRoute requiredRole="staff"><CreditSales /></RoleRoute></PrivateRoute>} />
              <Route path="/returns" element={<PrivateRoute><RoleRoute requiredRole="staff"><Returns /></RoleRoute></PrivateRoute>} />
              <Route path="/suppliers" element={<PrivateRoute><RoleRoute requiredRole="staff"><Suppliers /></RoleRoute></PrivateRoute>} />
              <Route path="/purchases" element={<PrivateRoute><RoleRoute requiredRole="staff"><Purchases /></RoleRoute></PrivateRoute>} />
              <Route path="/stock-take" element={<PrivateRoute><RoleRoute requiredRole="staff"><StockTake /></RoleRoute></PrivateRoute>} />
              <Route path="/expenses" element={<PrivateRoute><RoleRoute requiredRole="staff"><Expenses /></RoleRoute></PrivateRoute>} />
              <Route path="/debtors" element={<PrivateRoute><RoleRoute requiredRole="staff"><Debtors /></RoleRoute></PrivateRoute>} />
              <Route path="/finance" element={<PrivateRoute><RoleRoute requiredRole="admin"><Finance /></RoleRoute></PrivateRoute>} />
              <Route path="/products" element={<PrivateRoute><RoleRoute requiredRole="staff"><Products /></RoleRoute></PrivateRoute>} />
              <Route path="/dashboard" element={<PrivateRoute><RoleRoute requiredRole="staff"><Dashboard /></RoleRoute></PrivateRoute>} />
              <Route path="/customers" element={<PrivateRoute><RoleRoute requiredRole="staff"><Customers /></RoleRoute></PrivateRoute>} />
              <Route path="/orders" element={<PrivateRoute><RoleRoute requiredRole="staff"><Orders /></RoleRoute></PrivateRoute>} />
              <Route path="/tasks" element={<PrivateRoute><RoleRoute requiredRole="staff"><Tasks /></RoleRoute></PrivateRoute>} />
              <Route path="/automations" element={<PrivateRoute><RoleRoute requiredRole="staff"><Automations /></RoleRoute></PrivateRoute>} />
              <Route path="/documents" element={<PrivateRoute><RoleRoute requiredRole="staff"><Documents /></RoleRoute></PrivateRoute>} />
              <Route path="/analytics" element={<PrivateRoute><RoleRoute requiredRole="staff"><Analytics /></RoleRoute></PrivateRoute>} />
              <Route path="/notifications" element={<PrivateRoute><RoleRoute requiredRole="staff"><Notifications /></RoleRoute></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><RoleRoute requiredRole="staff"><AppSettings /></RoleRoute></PrivateRoute>} />
              {/* Admin-only routes */}
              <Route path="/staff" element={<PrivateRoute><RoleRoute requiredRole="manager"><StaffManagement /></RoleRoute></PrivateRoute>} />
              <Route path="/branches" element={<PrivateRoute><RoleRoute requiredRole="admin"><Branches /></RoleRoute></PrivateRoute>} />
              <Route path="/stock-transfers" element={<PrivateRoute><RoleRoute requiredRole="staff"><StockTransfers /></RoleRoute></PrivateRoute>} />
              <Route path="/attendance" element={<PrivateRoute><Attendance /></PrivateRoute>} />
              <Route path="/admin" element={<PrivateRoute><PlatformAdmin /></PrivateRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
      </CurrencyProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
