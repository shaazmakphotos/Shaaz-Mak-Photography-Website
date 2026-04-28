import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ImageIcon, LogOut, Camera, Home, RefreshCw, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Clients } from "./admin/Clients";
import { AlbumManager } from "./admin/AlbumManager";
import { PortfolioManager } from "./admin/PortfolioManager";
import { HomepageManager } from "./admin/HomepageManager";

interface AdminStats {
  albums: number;
  clients: number;
  photos: number;
}

export default function Admin() {
  const { user, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    } else if (!isLoading && user && !isAdmin) {
      navigate("/my-album");
    }
  }, [user, isAdmin, isLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      loadStats();
      // Pull the admin's own username from profiles so it's visible on screen.
      // Useful for remembering what to log in with.
      supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => setMyUsername(data?.username ?? null));
    }
  }, [user, isAdmin]);

  const loadStats = async () => {
    // RPC may not be in generated types yet — cast to any
    const { data, error } = await (supabase.rpc as any)("get_admin_stats");
    if (error) {
      console.error("Failed to load admin stats:", error);
      return;
    }
    setStats(data as unknown as AdminStats);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Trigger backfill-variants edge function and report progress
  const handleReprocess = async () => {
    setIsReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-variants", {
        body: {},
      });
      if (error) throw error;

      const summary = ["photos", "portfolio_photos", "homepage_photos"]
        .map((t) => {
          const r = data?.[t];
          return r ? `${t}: ${r.processed}/${r.processed + r.remaining}` : null;
        })
        .filter(Boolean)
        .join(" · ");

      toast({
        title: "Reprocessing complete",
        description: summary || "All images already have variants.",
      });
    } catch (err: any) {
      toast({
        title: "Reprocess failed",
        description: err?.message || "Could not run image reprocessing.",
        variant: "destructive",
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="border-b border-border/50 bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-medium">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Shaaz Mak Photography
              {user?.email && (
                <>
                  {" · "}
                  Logged in as <span className="font-medium">{user.email}</span>
                  {myUsername && (
                    <> (username: <span className="font-medium">{myUsername}</span>)</>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleReprocess}
              disabled={isReprocessing}
              className="border-border/50"
              title="Generate WebP variants for any photos that don't have them yet"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isReprocessing ? "animate-spin" : ""}`} />
              {isReprocessing ? "Reprocessing..." : "Reprocess images"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="border-border/50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Albums" value={stats?.albums} icon={<FolderOpen className="w-5 h-5" />} />
          <StatCard label="Clients" value={stats?.clients} icon={<Users className="w-5 h-5" />} />
          <StatCard label="Photos" value={stats?.photos} icon={<ImageIcon className="w-5 h-5" />} />
        </div>

        <Tabs defaultValue="albums" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="albums" className="data-[state=active]:bg-background">
              <ImageIcon className="w-4 h-4 mr-2" />
              Albums
            </TabsTrigger>
            <TabsTrigger value="homepage" className="data-[state=active]:bg-background">
              <Home className="w-4 h-4 mr-2" />
              Homepage
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="data-[state=active]:bg-background">
              <Camera className="w-4 h-4 mr-2" />
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="clients" className="data-[state=active]:bg-background">
              <Users className="w-4 h-4 mr-2" />
              Clients
            </TabsTrigger>
          </TabsList>

          <TabsContent value="albums">
            <AlbumManager onChange={loadStats} />
          </TabsContent>

          <TabsContent value="homepage">
            <HomepageManager />
          </TabsContent>

          <TabsContent value="portfolio">
            <PortfolioManager />
          </TabsContent>

          <TabsContent value="clients">
            <Clients onChange={loadStats} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | undefined;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-5 flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-serif font-medium mt-1">
          {value === undefined ? "—" : value}
        </p>
      </div>
      <div className="text-muted-foreground">{icon}</div>
    </div>
  );
}
