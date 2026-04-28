import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    // By the time we mount, Supabase has already consumed the recovery hash
    // from the URL and turned it into a session. So we just check: is there
    // an active session? If yes, the user came in via a recovery link and
    // can set a new password. If no, they hit this page directly with no
    // pending reset — bounce them to login.
    let cancelled = false;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setHasToken(true);
      } else {
        toast({
          title: "Invalid Reset Link",
          description: "Please request a new password reset link.",
          variant: "destructive",
        });
        navigate("/login");
      }
    };

    // Wait a tick — if the user just clicked an email link, Supabase may
    // still be in the middle of processing the hash. Give it a beat.
    const timer = setTimeout(check, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast({
        title: "Password Updated!",
        description: "You can now log in with your new password.",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasToken) {
    return null;
  }

  return (
    <Layout showFooter={false}>
      <section className="min-h-screen flex items-center justify-center py-32 px-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm mb-4">
              Password Reset
            </p>
            <h1 className="text-4xl font-serif mb-4">Set New Password</h1>
            <p className="text-muted-foreground">
              Enter your new password below
            </p>
          </div>

          {/* Form */}
          <div className="bg-card p-8 rounded-lg shadow-soft">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10 border-border focus:border-primary"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full bg-primary text-primary-foreground hover:bg-accent py-6 text-sm tracking-widest uppercase"
              >
                {isLoading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
}
