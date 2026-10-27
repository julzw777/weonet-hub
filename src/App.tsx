import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Billing from "./pages/Billing";
import Tickets from "./pages/Tickets";
import Network from "./pages/Network";
import Inventory from "./pages/Inventory";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Plans from "./pages/Plans";
import Admin from "./pages/Admin";
import Users from "./pages/Users";
import Reports from "./pages/Reports";
import Radius from "./pages/Radius";
import { AuditLog } from "@/components/audit-log";
import { ErrorBoundary } from "@/components/error-boundary";

const queryClient = new QueryClient();
const Soon = ({ t, d }: { t: string; d: string }) => <div className="p-6"><h1 className="text-2xl font-bold">{t}</h1><p className="mt-2 text-muted-foreground">{d}</p></div>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={
              <RequireAuth>
                <DashboardLayout>
                  <ErrorBoundary><Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/customers" element={<RequireAuth roles={["care", "finance", "tech", "noc", "readonly"]}><Customers /></RequireAuth>} />
                    <Route path="/billing" element={<RequireAuth roles={["finance", "readonly"]}><Billing /></RequireAuth>} />
                    <Route path="/tickets" element={<RequireAuth roles={["care", "tech", "noc", "readonly"]}><Tickets /></RequireAuth>} />
                    <Route path="/network" element={<RequireAuth roles={["noc", "tech", "readonly"]}><Network /></RequireAuth>} />
                    <Route path="/radius" element={<RequireAuth roles={["noc", "care"]}><Radius /></RequireAuth>} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/inventory" element={<RequireAuth roles={["warehouse", "tech", "readonly"]}><Inventory /></RequireAuth>} />
                    <Route path="/hotspot" element={<Soon t="Hotspot" d="Hotspot vouchers are out of scope until Weonet confirms the hotspot controller and voucher rules." />} />
                    <Route path="/reports" element={<RequireAuth roles={["finance", "care", "noc", "tech", "readonly"]}><Reports /></RequireAuth>} />
                    <Route path="/admin" element={<RequireAuth roles={["admin"]}><div className="space-y-6"><Admin /><AuditLog /></div></RequireAuth>} />
                    <Route path="/admin/users" element={<RequireAuth roles={["admin"]}><Users /></RequireAuth>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes></ErrorBoundary>
                </DashboardLayout>
              </RequireAuth>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
