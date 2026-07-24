import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, RequireAuth } from "@/contexts/AuthContext";
import { AlignmentProvider } from "@/contexts/AlignmentContext";
import Login from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Set dark mode as default
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('dark');
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AlignmentProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* EVERYTHING below sits behind the auth guard */}
              <Route element={<RequireAuth />}>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Index />} />
                <Route path="/performance" element={<Index />} />
                <Route path="/cash" element={<Index />} />
                <Route path="/treasury" element={<Index />} />
                <Route path="/payments" element={<Index />} />
                <Route path="/payment-priority" element={<Index />} />
                <Route path="/balance" element={<Index />} />
                <Route path="/analysis" element={<Index />} />
                {/* Legacy routes from the pre-alignment IA */}
                <Route path="/ratios" element={<Navigate to="/overview" replace />} />
                <Route path="/statements" element={<Navigate to="/overview" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            </AlignmentProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
