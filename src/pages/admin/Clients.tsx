import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Mail, Calendar, Eye, EyeOff, Check, X, User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  created_at: string;
  album_count?: number;
}

interface ClientsProps {
  onChange?: () => void;
}

export function Clients({ onChange }: ClientsProps = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Edit-client dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [newClient, setNewClient] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });

  // Password validation
  const passwordChecks = useMemo(() => {
    const pwd = newClient.password;
    return {
      length: pwd.length >= 6,
      lowercase: /[a-z]/.test(pwd),
      uppercase: /[A-Z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^a-zA-Z0-9]/.test(pwd),
    };
  }, [newClient.password]);

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      // Get all client profiles by joining with user_roles
      const { data: clientRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'client');

      if (rolesError) throw rolesError;

      if (!clientRoles || clientRoles.length === 0) {
        setClients([]);
        setIsLoading(false);
        return;
      }

      const clientUserIds = clientRoles.map(r => r.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', clientUserIds);

      if (profilesError) throw profilesError;

      // Get album counts for each client
      const { data: albums, error: albumsError } = await supabase
        .from('albums')
        .select('client_id');

      if (albumsError) throw albumsError;

      const albumCounts: Record<string, number> = {};
      albums?.forEach(album => {
        albumCounts[album.client_id] = (albumCounts[album.client_id] || 0) + 1;
      });

      const clientsWithCounts = profiles?.map(profile => ({
        ...profile,
        album_count: albumCounts[profile.user_id] || 0,
      })) || [];

      setClients(clientsWithCounts);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: "Error",
        description: "Failed to load clients.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-client', {
        body: {
          email: newClient.email,
          password: newClient.password,
          fullName: newClient.fullName,
          username: newClient.username,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Client created!",
        description: `Account created for ${newClient.fullName}. Username: ${newClient.username}`,
      });

      setNewClient({ fullName: "", username: "", email: "", password: "" });
      setDialogOpen(false);
      fetchClients();
      onChange?.();
    } catch (error: any) {
      console.error('Error creating client:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create client account.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    setIsDeleting(true);

    try {
      const { data, error } = await supabase.functions.invoke('delete-client', {
        body: { userId: clientToDelete.user_id },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Client deleted",
        description: `${clientToDelete.full_name || 'Client'} has been removed.`,
      });

      setDeleteDialogOpen(false);
      setClientToDelete(null);
      fetchClients();
      onChange?.();
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete client.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Open edit dialog populated with client's current values
  const handleEditClick = (client: Client) => {
    setEditingClient(client);
    setEditFullName(client.full_name || "");
    setEditUsername(client.username || "");
    setEditNewPassword("");
    setShowEditPassword(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setIsSavingEdit(true);

    try {
      const { data, error } = await supabase.functions.invoke("update-client", {
        body: {
          userId: editingClient.user_id,
          fullName: editFullName,
          username: editUsername.toLowerCase().replace(/\s/g, ""),
          newPassword: editNewPassword || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Client updated",
        description: `${editFullName || "Client"} has been updated.`,
      });
      setEditDialogOpen(false);
      setEditingClient(null);
      fetchClients();
      onChange?.();
    } catch (err: any) {
      console.error("Error updating client:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update client.",
        variant: "destructive",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-medium">Clients</h2>
          <p className="text-muted-foreground">Manage your client accounts</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateClient} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={newClient.fullName}
                  onChange={(e) => setNewClient({ ...newClient, fullName: e.target.value })}
                  placeholder="John & Jane Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username (for login)</Label>
                <Input
                  id="username"
                  value={newClient.username}
                  onChange={(e) => setNewClient({ ...newClient, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                  placeholder="johnsmith"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This is what the client will use to log in.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (hidden from client)</Label>
                <Input
                  id="email"
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="client@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Temporary Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={newClient.password}
                    onChange={(e) => setNewClient({ ...newClient, password: e.target.value })}
                    placeholder="Create a strong password"
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="space-y-1 text-xs mt-2">
                  <p className="text-muted-foreground font-medium">Password requirements:</p>
                  <div className="grid grid-cols-2 gap-1">
                    <div className={`flex items-center gap-1 ${passwordChecks.length ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordChecks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      6+ characters
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.lowercase ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordChecks.lowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Lowercase letter
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.uppercase ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordChecks.uppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Uppercase letter
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.number ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordChecks.number ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Number
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.special ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordChecks.special ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Special character
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Share this password with your client. They can change it later.
                </p>
              </div>
              <Button
                type="submit"
                disabled={isCreating || !isPasswordValid}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isCreating ? "Creating..." : "Create Client Account"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-border/50">
          <p className="text-muted-foreground mb-4">No clients yet</p>
          <Button
            onClick={() => setDialogOpen(true)}
            variant="outline"
            className="border-primary/30"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Client
          </Button>
        </div>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <Table>
             <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Albums</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[110px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.full_name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" />
                      {client.username || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      {client.email}
                    </div>
                  </TableCell>
                  <TableCell>{client.album_count} album(s)</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {formatDate(client.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(client)}
                        title="Edit client"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteClick(client)}
                        title="Delete client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit client dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Full Name</Label>
              <Input
                id="editFullName"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editUsername">Username</Label>
              <Input
                id="editUsername"
                value={editUsername}
                onChange={(e) =>
                  setEditUsername(e.target.value.toLowerCase().replace(/\s/g, ""))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPassword">New Password (leave blank to keep current)</Label>
              <div className="relative">
                <Input
                  id="editPassword"
                  type={showEditPassword ? "text" : "password"}
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isSavingEdit}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{clientToDelete?.full_name || 'this client'}</strong>? 
              This will permanently remove their account, all their albums, and all photos. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
