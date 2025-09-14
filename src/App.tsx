import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Billing from "./pages/Billing";
import Tickets from "./pages/Tickets";
import Network from "./pages/Network";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/network" element={<Network />} />
            {/* Placeholder routes for remaining pages */}
            <Route path="/plans" element={<div className="p-6"><h1 className="text-2xl font-bold">Plans - Coming Soon</h1></div>} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/hotspot" element={<div className="p-6"><h1 className="text-2xl font-bold">Hotspot - Coming Soon</h1></div>} />
            <Route path="/reports" element={<div className="p-6"><h1 className="text-2xl font-bold">Reports - Coming Soon</h1></div>} />
            <Route path="/admin" element={<div className="p-6"><h1 className="text-2xl font-bold">Admin - Coming Soon</h1></div>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;