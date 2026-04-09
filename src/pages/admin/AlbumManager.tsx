import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, ImageIcon, Calendar, User, ExternalLink, Trash2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cdn } from "@/lib/cdn";

interface Album {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  cover_photo_url: string | null;
  client_id: string;
  created_at: string;
  client_name?: string;
  photo_count?: number;
}

interface Client {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface AlbumManagerProps {
  onChange?: () => void;
}

export function AlbumManager({ onChange }: AlbumManagerProps = {}) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<Album | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Edit-album dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editAlbum, setEditAlbum] = useState({
    title: "",
    description: "",
    eventDate: "",
    clientId: "",
  });
  const [newAlbum, setNewAlbum] = useState({
    title: "",
    description: "",
    eventDate: "",
    clientId: "",
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch clients
      const { data: clientRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'client');

      if (clientRoles && clientRoles.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', clientRoles.map(r => r.user_id));
        
        setClients(profiles || []);
      }

      // Fetch all albums
      const { data: albumsData, error: albumsError } = await supabase
        .from('albums')
        .select('*')
        .order('created_at', { ascending: false });

      if (albumsError) throw albumsError;

      // Get photo counts
      const { data: photos } = await supabase
        .from('photos')
        .select('album_id');

      const photoCounts: Record<string, number> = {};
      photos?.forEach(photo => {
        photoCounts[photo.album_id] = (photoCounts[photo.album_id] || 0) + 1;
      });

      // Get client names
      const clientIds = [...new Set(albumsData?.map(a => a.client_id) || [])];
      const { data: clientProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', clientIds);

      const clientNames: Record<string, string> = {};
      clientProfiles?.forEach(p => {
        clientNames[p.user_id] = p.full_name || 'Unknown';
      });

      const albumsWithData = albumsData?.map(album => ({
        ...album,
        client_name: clientNames[album.client_id] || 'Unknown',
        photo_count: photoCounts[album.id] || 0,
      })) || [];

      setAlbums(albumsWithData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load albums.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const { error } = await supabase
        .from('albums')
        .insert({
          title: newAlbum.title,
          description: newAlbum.description || null,
          event_date: newAlbum.eventDate || null,
          client_id: newAlbum.clientId,
        });

      if (error) throw error;

      toast({
        title: "Album created!",
        description: `"${newAlbum.title}" has been created.`,
      });

      setNewAlbum({ title: "", description: "", eventDate: "", clientId: "" });
      setDialogOpen(false);
      fetchData();
      onChange?.();
    } catch (error: any) {
      console.error('Error creating album:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create album.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!albumToDelete) return;
    setIsDeleting(true);

    try {
      // First, get all photos in this album
      const { data: albumPhotos, error: photosError } = await supabase
        .from('photos')
        .select('id, url')
        .eq('album_id', albumToDelete.id);

      if (photosError) throw photosError;

      // Delete photos from storage
      if (albumPhotos && albumPhotos.length > 0) {
        // Extract file paths from URLs
        const filePaths = albumPhotos
          .map(photo => {
            try {
              const url = new URL(photo.url);
              const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/photos\/(.+)/);
              return pathMatch ? pathMatch[1] : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];

        if (filePaths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('photos')
            .remove(filePaths);

          if (storageError) {
            console.error('Storage deletion error:', storageError);
            // Continue anyway - the files might not exist
          }
        }

        // Delete share links and shared photos for this album
        const { data: shareLinks } = await supabase
          .from('share_links')
          .select('id')
          .eq('album_id', albumToDelete.id);

        if (shareLinks && shareLinks.length > 0) {
          const shareLinkIds = shareLinks.map(sl => sl.id);
          
          // Delete shared_photos entries
          await supabase
            .from('shared_photos')
            .delete()
            .in('share_link_id', shareLinkIds);

          // Delete share_links
          await supabase
            .from('share_links')
            .delete()
            .eq('album_id', albumToDelete.id);
        }

        // Delete photos from database
        const { error: deletePhotosError } = await supabase
          .from('photos')
          .delete()
          .eq('album_id', albumToDelete.id);

        if (deletePhotosError) throw deletePhotosError;
      }

      // Finally, delete the album
      const { error: deleteAlbumError } = await supabase
        .from('albums')
        .delete()
        .eq('id', albumToDelete.id);

      if (deleteAlbumError) throw deleteAlbumError;

      toast({
        title: "Album deleted",
        description: `"${albumToDelete.title}" and all its photos have been deleted.`,
      });

      setDeleteDialogOpen(false);
      setAlbumToDelete(null);
      fetchData();
      onChange?.();
    } catch (error: any) {
      console.error('Error deleting album:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete album.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Open edit dialog populated with album's current values
  const handleEditClick = (album: Album) => {
    setEditingAlbum(album);
    setEditAlbum({
      title: album.title,
      description: album.description || "",
      eventDate: album.event_date ? album.event_date.slice(0, 10) : "",
      clientId: album.client_id,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from("albums")
        .update({
          title: editAlbum.title,
          description: editAlbum.description || null,
          event_date: editAlbum.eventDate || null,
          client_id: editAlbum.clientId,
        })
        .eq("id", editingAlbum.id);

      if (error) throw error;

      toast({ title: "Album updated", description: `"${editAlbum.title}" saved.` });
      setEditDialogOpen(false);
      setEditingAlbum(null);
      fetchData();
      onChange?.();
    } catch (err: any) {
      console.error("Error updating album:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update album.",
        variant: "destructive",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
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
          <h2 className="text-2xl font-serif font-medium">Albums</h2>
          <p className="text-muted-foreground">Create and manage client albums</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={clients.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Album
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Album</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAlbum} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="client">Client</Label>
                <Select
                  value={newAlbum.clientId}
                  onValueChange={(value) => setNewAlbum({ ...newAlbum, clientId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.user_id} value={client.user_id}>
                        {client.full_name || client.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Album Title</Label>
                <Input
                  id="title"
                  value={newAlbum.title}
                  onChange={(e) => setNewAlbum({ ...newAlbum, title: e.target.value })}
                  placeholder="Wedding Day - Smith Family"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={newAlbum.description}
                  onChange={(e) => setNewAlbum({ ...newAlbum, description: e.target.value })}
                  placeholder="Beautiful moments from the wedding..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventDate">Event Date (optional)</Label>
                <Input
                  id="eventDate"
                  type="date"
                  value={newAlbum.eventDate}
                  onChange={(e) => setNewAlbum({ ...newAlbum, eventDate: e.target.value })}
                />
              </div>
              <Button
                type="submit"
                disabled={isCreating || !newAlbum.clientId}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isCreating ? "Creating..." : "Create Album"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
          <p className="text-sm">
            You need to create at least one client before you can create albums.
          </p>
        </div>
      )}

      {albums.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-border/50">
          <ImageIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No albums yet</p>
          {clients.length > 0 && (
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              className="border-primary/30"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Album
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {albums.map((album) => (
            <div
              key={album.id}
              className="group bg-card border border-border/50 rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-video bg-muted/50 relative overflow-hidden">
                {album.cover_photo_url ? (
                  <img
                    src={cdn(album.cover_photo_url)}
                    alt={album.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                  {album.photo_count} photos
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-serif font-medium text-lg mb-1">{album.title}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <User className="w-4 h-4" />
                  {album.client_name}
                </div>
                {album.event_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <Calendar className="w-4 h-4" />
                    {formatDate(album.event_date)}
                  </div>
                )}
                <div className="flex gap-2">
                  <Link to={`/admin/album/${album.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full border-primary/30">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manage Photos
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/30"
                    onClick={() => handleEditClick(album)}
                    title="Edit album"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      setAlbumToDelete(album);
                      setDeleteDialogOpen(true);
                    }}
                    title="Delete album"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Album Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Album</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="editClient">Client</Label>
              <Select
                value={editAlbum.clientId}
                onValueChange={(value) => setEditAlbum({ ...editAlbum, clientId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.user_id} value={client.user_id}>
                      {client.full_name || client.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editTitle">Album Title</Label>
              <Input
                id="editTitle"
                value={editAlbum.title}
                onChange={(e) => setEditAlbum({ ...editAlbum, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDescription">Description (optional)</Label>
              <Textarea
                id="editDescription"
                value={editAlbum.description}
                onChange={(e) => setEditAlbum({ ...editAlbum, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEventDate">Event Date (optional)</Label>
              <Input
                id="editEventDate"
                type="date"
                value={editAlbum.eventDate}
                onChange={(e) => setEditAlbum({ ...editAlbum, eventDate: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              disabled={isSavingEdit || !editAlbum.clientId}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Album</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{albumToDelete?.title}"? This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>The album and its settings</li>
                <li>All {albumToDelete?.photo_count || 0} photos in this album</li>
                <li>All share links for this album</li>
              </ul>
              <p className="mt-2 font-medium text-destructive">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAlbum}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Album"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
