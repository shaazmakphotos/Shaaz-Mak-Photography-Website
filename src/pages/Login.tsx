import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, User, Lock } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, isAdmin, isClient, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  // Role-based redirect after login
  useEffect(() => {
    if (user && !authLoading && role) {
      if (isAdmin) {
        navigate("/admin");
      } else if (isClient) {
        navigate("/my-album");
      } else {
        navigate("/");
      }
    }
  }, [user, role, isAdmin, isClient, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const raw = formData.username.trim();

      // The login field accepts either a username or an email.
      // If the input looks like an email, use it directly. Otherwise look
      // up the email by username, trying common case variations until the
      // DB function is updated to do LOWER() server-side.
      let email: string | null = null;

      if (raw.includes("@")) {
        email = raw;
      } else {
        const variations = Array.from(new Set([
          raw,
          raw.toLowerCase(),
          raw.toUpperCase(),
          raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
        ]));
        for (const candidate of variations) {
          const { data } = await supabase
            .rpc('get_email_by_username', { _username: candidate });
          if (data) { email = data; break; }
        }
      }

      if (!email) {
        throw new Error("Invalid username or password");
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: formData.password,
      });

      if (error) throw new Error("Invalid username or password");

      toast({
        title: "Welcome Back!",
        description: "You've successfully logged in.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout showFooter={false}>
      <section className="min-h-screen flex items-center justify-center py-32 px-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm mb-4">
              Client Portal
            </p>
            <h1 className="text-4xl font-serif mb-4">Welcome Back</h1>
            <p className="text-muted-foreground">
              Sign in to access your photo albums
            </p>
          </div>

          {/* Form */}
          <div className="bg-card p-8 rounded-lg shadow-soft">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username">Username or Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    placeholder="Username or email address"
                    required
                    className="pl-10 border-border focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10 pr-10 border-border focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full bg-primary text-primary-foreground hover:bg-accent py-6 text-sm tracking-widest uppercase"
              >
                {isLoading ? "Please wait..." : "Sign In"}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const email = window.prompt(
                      "Enter the email address on your account. We'll send a password reset link."
                    );
                    if (!email) return;
                    const { error } = await supabase.auth.resetPasswordForEmail(
                      email.trim(),
                      { redirectTo: `${window.location.origin}/reset-password` }
                    );
                    if (error) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                    } else {
                      toast({
                        title: "Check your email",
                        description: "If an account exists for that email, a reset link is on its way.",
                      });
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
}
