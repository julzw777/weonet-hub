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
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/customers" element={<RequireAuth roles={["care", "finance", "tech", "noc", "readonly"]}><Customers /></RequireAuth>} />
                    <Route path="/billing" element={<RequireAuth roles={["finance", "readonly"]}><Billing /></RequireAuth>} />
                    <Route path="/tickets" element={<RequireAuth roles={["care", "tech", "noc", "readonly"]}><Tickets /></RequireAuth>} />
                    <Route path="/network" element={<RequireAuth roles={["noc", "tech", "readonly"]}><Network /></RequireAuth>} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/inventory" element={<RequireAuth roles={["warehouse", "tech", "readonly"]}><Inventory /></RequireAuth>} />
                    <Route path="/hotspot" element={<Soon t="Hotspot" d="Hotspot vouchers are out of scope until Weonet confirms the hotspot controller and voucher rules." />} />
                    <Route path="/reports" element={<Soon t="Reports" d="Reports will be built on real billing and ticket data in a later stage." />} />
                    <Route path="/admin" element={<RequireAuth roles={["admin"]}><Admin /></RequireAuth>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
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
