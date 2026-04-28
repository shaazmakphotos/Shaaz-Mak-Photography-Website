import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Portfolio from "./pages/Portfolio";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import MyAlbum from "./pages/MyAlbum";
import SharedAlbum from "./pages/SharedAlbum";
import NotFound from "./pages/NotFound";
import { PhotoUpload } from "./pages/admin/PhotoUpload";
import SetupAdmin from "./pages/SetupAdmin";

const queryClient = new QueryClient();

// When Supabase processes a password-recovery token from an email link, it
// auto-signs the user in and fires PASSWORD_RECOVERY. Without this listener,
// the user lands at /admin (or /my-album) already logged in and has no chance
// to actually set a new password. We catch the event globally and force them
// to /reset-password.
function PasswordRecoveryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PasswordRecoveryRedirect />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup-admin" element={<SetupAdmin />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/album/:albumId" element={<PhotoUpload />} />
          <Route path="/my-album" element={<MyAlbum />} />
          <Route path="/shared/:token" element={<SharedAlbum />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
