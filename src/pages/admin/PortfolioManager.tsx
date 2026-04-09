import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uploadAndProcessPhoto, ProcessedUpload } from "@/lib/uploadPhoto";
import { cdn } from "@/lib/cdn";

const categories = ["Weddings", "Graduations", "Events"];

interface PortfolioPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url: string | null;
  category: string;
  alt: string;
  sort_order: number;
  created_at: string;
  width: number | null;
  height: number | null;
}

export function PortfolioManager() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<PortfolioPhoto | null>(null);
  const [newPhoto, setNewPhoto] = useState({
    category: "Weddings",
    alt: "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [pendingUploads, setPendingUploads] = useState<ProcessedUpload[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["portfolio-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_photos")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as PortfolioPhoto[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ uploads, category, alt }: { uploads: ProcessedUpload[]; category: string; alt: string }) => {
      const maxOrder = photos.length > 0 ? Math.max(...photos.map(p => p.sort_order)) + 1 : 0;
      const inserts = uploads.map((u, index) => ({
        url: u.url,
        thumbnail_url: u.thumbnail_url,
        preview_url: u.preview_url,
        width: u.width,
        height: u.height,
        category,
        alt,
        sort_order: maxOrder + index,
      }));
      const { error } = await supabase.from("portfolio_photos").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      setIsAddOpen(false);
      setNewPhoto({ category: "Weddings", alt: "" });
      setPendingUploads([]);
      toast.success("Photos added to portfolio");
    },
    onError: () => toast.error("Failed to add photos"),
  });

  const updateMutation = useMutation({
    mutationFn: async (photo: PortfolioPhoto) => {
      const { error } = await supabase
        .from("portfolio_photos")
        .update({ category: photo.category, alt: photo.alt })
        .eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      setEditingPhoto(null);
      toast.success("Photo updated");
    },
    onError: () => toast.error("Failed to update photo"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolio_photos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      toast.success("Photo removed from portfolio");
    },
    onError: () => toast.error("Failed to delete photo"),
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedPhotos: PortfolioPhoto[]) => {
      // Batch update with single upsert call
      const updates = reorderedPhotos.map((photo, index) => ({
        id: photo.id,
        url: photo.url,
        sort_order: index,
      }));

      const { error } = await supabase
        .from("portfolio_photos")
        .upsert(updates, { onConflict: 'id' });
      
      if (error) throw error;
    },
    onError: () => {
      // Only refetch on error to revert optimistic update
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      toast.error("Failed to reorder photos");
    },
  });

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const reordered = [...photos];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, removed);

    // Optimistic update - update cache immediately for instant feedback
    queryClient.setQueryData(["portfolio-photos"], reordered);
    
    // Then persist to database in background
    reorderMutation.mutate(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    const uploaded: ProcessedUpload[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const processed = await uploadAndProcessPhoto(files[i], "portfolio");
        uploaded.push(processed);
      }
      setPendingUploads(uploaded);
      toast.success(`${uploaded.length} image(s) uploaded`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload images");
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
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
          <h2 className="text-xl font-medium">Portfolio Photos</h2>
          <p className="text-sm text-muted-foreground">
            Manage photos displayed on your public portfolio page
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Photo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Portfolio Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Upload Images (select multiple)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                {uploading && (
                  <p className="text-sm text-muted-foreground">
                    Uploading {uploadProgress.current} of {uploadProgress.total}...
                  </p>
                )}
              </div>

              {pendingUploads.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {pendingUploads.map((u, idx) => (
                    <img
                      key={idx}
                      src={cdn(u.thumbnail_url)}
                      alt={`Preview ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={newPhoto.category}
                  onValueChange={(value) =>
                    setNewPhoto((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Alt Text (Description)</Label>
                <Input
                  value={newPhoto.alt}
                  onChange={(e) =>
                    setNewPhoto((prev) => ({ ...prev, alt: e.target.value }))
                  }
                  placeholder="Beautiful wedding ceremony..."
                />
              </div>

              <Button
                className="w-full"
                onClick={() =>
                  addMutation.mutate({
                    uploads: pendingUploads,
                    category: newPhoto.category,
                    alt: newPhoto.alt,
                  })
                }
                disabled={pendingUploads.length === 0 || addMutation.isPending}
              >
                {pendingUploads.length > 0
                  ? `Add ${pendingUploads.length} Photo${pendingUploads.length > 1 ? "s" : ""} to Portfolio`
                  : "Upload images first"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingPhoto} onOpenChange={() => setEditingPhoto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Photo</DialogTitle>
          </DialogHeader>
          {editingPhoto && (
            <div className="space-y-4 pt-4">
              <img
                src={cdn(editingPhoto.preview_url || editingPhoto.thumbnail_url || editingPhoto.url)}
                alt={editingPhoto.alt}
                className="w-full h-48 object-cover rounded-lg"
              />

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editingPhoto.category}
                  onValueChange={(value) =>
                    setEditingPhoto((prev) =>
                      prev ? { ...prev, category: value } : null
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Alt Text</Label>
                <Input
                  value={editingPhoto.alt}
                  onChange={(e) =>
                    setEditingPhoto((prev) =>
                      prev ? { ...prev, alt: e.target.value } : null
                    )
                  }
                />
              </div>

              <Button
                className="w-full"
                onClick={() => editingPhoto && updateMutation.mutate(editingPhoto)}
                disabled={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photos Grid */}
      {photos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No portfolio photos yet. Add your first photo above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={`relative rounded-lg overflow-hidden bg-muted cursor-grab active:cursor-grabbing transition-transform will-change-transform ${
                draggedIndex === index ? "opacity-50 scale-95" : ""
              } ${dragOverIndex === index ? "ring-2 ring-primary ring-offset-2 scale-105" : ""}`}
            >
              <img
                src={cdn(photo.thumbnail_url || photo.url)}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                className="w-full aspect-[3/4] object-cover pointer-events-none"
              />
              {/* Drag handle indicator */}
              <div className="absolute top-2 left-2">
                <div className="h-8 w-8 rounded-md bg-secondary/80 flex items-center justify-center">
                  <GripVertical className="w-4 h-4 text-secondary-foreground" />
                </div>
              </div>
              {/* Action controls */}
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={() => setEditingPhoto(photo)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  onClick={() => deleteMutation.mutate(photo.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2">
                <span className="text-xs text-white/80">{photo.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
