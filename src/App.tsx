import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import UValueWorkspace from "./components/UValueWorkspace";
import AnalysisWorkspace from "./components/AnalysisWorkspace";
import ComingSoon from "./pages/ComingSoon";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/u-value" element={<UValueWorkspace />} />
            <Route path="/cra" element={<AnalysisWorkspace />} />
            <Route path="/overheating" element={<ComingSoon title="Overheating Analysis" description="Simplified & TM59 dynamic overheating assessment for dwellings and non-domestic buildings." />} />
            <Route path="/sbem" element={<ComingSoon title="SBEM" description="Simplified Building Energy Model calculations for non-domestic buildings." />} />
            <Route path="/sap" element={<ComingSoon title="SAP Calculations" description="Standard Assessment Procedure for domestic dwellings energy performance." />} />
            <Route path="/water" element={<ComingSoon title="Water Calculations" description="Water usage, drainage and flow rate calculations." />} />
            <Route path="/thermal-bridging" element={<ComingSoon title="Thermal Bridging" description="Linear thermal transmittance (ψ-values) per ISO 10211." />} />
            <Route path="/daylighting" element={<ComingSoon title="Daylighting" description="Daylight factor, ADF and compliance with BB 103 & CIBSE LG10." />} />
            <Route path="/thermal-modelling" element={<ComingSoon title="Thermal Modelling" description="TM52, TM54, dynamic simulation & thermal comfort analysis." />} />
            <Route path="/energy-statements" element={<ComingSoon title="Energy Statements" description="Part L compliance, energy strategy and EPC reporting." />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
