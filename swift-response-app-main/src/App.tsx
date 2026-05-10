import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DriverProvider } from "@/contexts/DriverContext";
import Index from "./pages/Index";
import DriverDashboard from "./pages/DriverDashboard";
import EmergencyAlert from "./pages/EmergencyAlert";
import DispatchDetails from "./pages/DispatchDetails";
import TripComplete from "./pages/TripComplete";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DriverProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/driver">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<DriverDashboard />} />
            <Route path="/emergency" element={<EmergencyAlert />} />
            <Route path="/dispatch" element={<DispatchDetails />} />
            <Route path="/complete" element={<TripComplete />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </DriverProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
