import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, GripVertical, CheckSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uploadAndProcessPhoto, ProcessedUpload } from "@/lib/uploadPhoto";
import { cdn } from "@/lib/cdn";

// The four real portfolio categories. "All" is a UI-only filter option.
const categories = ["Weddings", "Graduations", "Events", "Portraits"];
const filterOptions = ["All", ...categories];

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

// A pending upload that also carries the category the user picked for it.
interface PendingUpload extends ProcessedUpload {
  category: string;
}

export function PortfolioManager() {
  const queryClient = useQueryClient();

  // --- Dialog / form state ---
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<PortfolioPhoto | null>(null);
  const [globalAlt, setGlobalAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  // --- Grid view state (filter + select + drag) ---
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string>(categories[0]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // --- Drag state ---
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Auto-scroll the page while dragging near the top or bottom viewport edge.
  // HTML5 native drag-and-drop never scrolls the window itself, so we do it
  // manually: listen to dragover on the window and nudge scrollY when the
  // pointer is within 80px of an edge. Speed is proportional to how close.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (draggedIndex === null) return;

    const onDragOver = (e: DragEvent) => {
      const ZONE = 80; // px from edge that triggers scrolling
      const { clientY } = e;
      const { innerHeight } = window;

      let speed = 0;
      if (clientY < ZONE) {
        speed = -Math.round((ZONE - clientY) / 8); // scroll up
      } else if (clientY > innerHeight - ZONE) {
        speed = Math.round((clientY - (innerHeight - ZONE)) / 8); // scroll down
      }

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (speed !== 0) {
        const step = () => {
          window.scrollBy(0, speed);
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      }
    };

    const onDragEnd = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDragEnd);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDragEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [draggedIndex]);

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

  // Photos currently visible in the admin grid (respecting the filter tab).
  const visiblePhotos = useMemo(
    () =>
      filterCategory === "All"
        ? photos
        : photos.filter((p) => p.category === filterCategory),
    [photos, filterCategory],
  );

  // Map of category -> count for the filter tab badges.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: photos.length };
    for (const cat of categories) counts[cat] = 0;
    for (const p of photos) counts[p.category] = (counts[p.category] || 0) + 1;
    return counts;
  }, [photos]);

  // --- Mutations ---

  const addMutation = useMutation({
    mutationFn: async ({ uploads, alt }: { uploads: PendingUpload[]; alt: string }) => {
      const maxOrder = photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0;
      // preview_url omitted — column not in live DB schema yet. See
      // add_image_variants migration; frontend falls back to url meanwhile.
      const inserts = uploads.map((u, index) => ({
        url: u.url,
        thumbnail_url: u.thumbnail_url,
        width: u.width,
        height: u.height,
        category: u.category,
        alt,
        sort_order: maxOrder + index,
      }));
      const { error } = await supabase.from("portfolio_photos").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      setIsAddOpen(false);
      setGlobalAlt("");
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

  // Bulk: change category for all selectedIds in a single SQL round-trip.
  const bulkCategoryMutation = useMutation({
    mutationFn: async ({ ids, category }: { ids: string[]; category: string }) => {
      const { error } = await supabase
        .from("portfolio_photos")
        .update({ category })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      setSelectedIds(new Set());
      toast.success(`${vars.ids.length} photo(s) moved to ${vars.category}`);
    },
    onError: () => toast.error("Failed to change categories"),
  });

  // Bulk: delete all selectedIds in a single SQL round-trip.
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("portfolio_photos").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success(`${ids.length} photo(s) deleted`);
    },
    onError: () => toast.error("Failed to delete photos"),
  });

  // Reorder: smart update that respects the current filter.
  // - In "All": rewrite every row's sort_order to its new index.
  // - In a filtered view: only rewrite the sort_orders of the rows in the filter,
  //   reusing the sort_order *slots* those rows already occupied — so photos in
  //   other categories don't shift on the public page.
  const reorderMutation = useMutation({
    mutationFn: async (reordered: PortfolioPhoto[]) => {
      let updates: { id: string; url: string; sort_order: number }[];

      if (filterCategory === "All") {
        // Global reorder — assign new sort_order = index for every row.
        updates = reordered.map((p, i) => ({ id: p.id, url: p.url, sort_order: i }));
      } else {
        // Filtered reorder — keep the same set of sort_order slots, reassigned in the new order.
        const slots = [...reordered.map((p) => p.sort_order)].sort((a, b) => a - b);
        updates = reordered.map((p, i) => ({ id: p.id, url: p.url, sort_order: slots[i] }));
      }

      const { error } = await supabase
        .from("portfolio_photos")
        .upsert(updates, { onConflict: "id" });
      if (error) throw error;
    },
    onError: () => {
      // Revert optimistic cache update on failure.
      queryClient.invalidateQueries({ queryKey: ["portfolio-photos"] });
      toast.error("Failed to reorder photos");
    },
  });

  // --- Drag handlers (disabled in select mode) ---

  const handleDragStart = (index: number) => {
    if (isSelectMode) return;
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isSelectMode || draggedIndex === null) return;
    e.preventDefault();
    if (draggedIndex !== index) setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (isSelectMode || draggedIndex === null || draggedIndex === dropIndex) return;

    // Reorder within the visible (filtered) list.
    const reordered = [...visiblePhotos];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, removed);

    // Optimistic cache update. In filtered mode we also need to leave the
    // out-of-filter photos untouched in the cache, so we merge.
    if (filterCategory === "All") {
      queryClient.setQueryData(["portfolio-photos"], reordered);
    } else {
      // Build the merged full list for optimistic UI: other-category photos
      // keep their position; filtered photos appear in the new order at the
      // slots they previously occupied (sorted).
      const filteredIds = new Set(reordered.map((p) => p.id));
      const others = photos.filter((p) => !filteredIds.has(p.id));
      const slots = reordered.map((p) => p.sort_order).sort((a, b) => a - b);
      const reorderedWithSlots = reordered.map((p, i) => ({ ...p, sort_order: slots[i] }));
      const merged = [...others, ...reorderedWithSlots].sort((a, b) => a.sort_order - b.sort_order);
      queryClient.setQueryData(["portfolio-photos"], merged);
    }

    reorderMutation.mutate(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // --- File upload: each file becomes a PendingUpload with its own category ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    const uploaded: PendingUpload[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const processed = await uploadAndProcessPhoto(files[i], "portfolio");
        // Default each photo to the currently-selected filter (if it's a real
        // category) so users filtering "Weddings" and then uploading get them
        // pre-tagged as Weddings.
        const defaultCategory = categories.includes(filterCategory) ? filterCategory : categories[0];
        uploaded.push({ ...processed, category: defaultCategory });
      }
      setPendingUploads((prev) => [...prev, ...uploaded]);
      const missing = uploaded.filter((u) => !u.variantsReady).length;
      if (missing > 0) {
        toast.error(
          `${uploaded.length} uploaded (pick categories), but ${missing} missing WebP variants. Deploy process-upload, then Admin → Reprocess images.`
        );
      } else {
        toast.success(`${uploaded.length} image(s) uploaded — now pick a category for each`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload images");
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const updatePendingCategory = (idx: number, category: string) => {
    setPendingUploads((prev) => prev.map((p, i) => (i === idx ? { ...p, category } : p)));
  };

  const removePending = (idx: number) => {
    setPendingUploads((prev) => prev.filter((_, i) => i !== idx));
  };

  // --- Selection helpers ---

  const toggleSelection = (index: number, id: string, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (shift && lastSelectedIndex !== null) {
        // Select the range [lastSelectedIndex, index] from visiblePhotos.
        const [from, to] = [lastSelectedIndex, index].sort((a, b) => a - b);
        for (let i = from; i <= to; i++) next.add(visiblePhotos[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedIndex(index);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    clearSelection();
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-medium">Portfolio Photos</h2>
          <p className="text-sm text-muted-foreground">
            Filter by category, drag to reorder, or use Select mode to bulk-edit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isSelectMode ? "default" : "outline"}
            onClick={() => (isSelectMode ? exitSelectMode() : setIsSelectMode(true))}
          >
            <CheckSquare className="w-4 h-4 mr-2" />
            {isSelectMode ? "Exit Select" : "Select"}
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={isSelectMode}>
                <Plus className="w-4 h-4 mr-2" />
                Add Photos
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Portfolio Photos</DialogTitle>
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
                  <div className="space-y-2">
                    <Label>Pick a category for each photo</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                      {pendingUploads.map((u, idx) => (
                        <div key={idx} className="space-y-1 relative">
                          <button
                            type="button"
                            onClick={() => removePending(idx)}
                            className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                            title="Remove from batch"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <img
                            src={cdn(u.thumbnail_url || u.url)}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <Select
                            value={u.category}
                            onValueChange={(value) => updatePendingCategory(idx, value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
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
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Alt Text (applied to all photos in this batch)</Label>
                  <Input
                    value={globalAlt}
                    onChange={(e) => setGlobalAlt(e.target.value)}
                    placeholder="Beautiful wedding ceremony..."
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() =>
                    addMutation.mutate({ uploads: pendingUploads, alt: globalAlt })
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
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border/50 pb-4">
        {filterOptions.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setFilterCategory(cat);
              clearSelection();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-primary/10"
            }`}
          >
            {cat} ({categoryCounts[cat] ?? 0})
          </button>
        ))}
      </div>

      {/* Bulk action bar (visible only when something is selected) */}
      {isSelectMode && selectedIds.size > 0 && (
        <div className="sticky top-16 z-30 bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-3 shadow-md">
          <span className="text-sm font-medium">
            {selectedIds.size} photo{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Move to:</Label>
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="w-40 h-9">
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
            <Button
              size="sm"
              onClick={() =>
                bulkCategoryMutation.mutate({
                  ids: Array.from(selectedIds),
                  category: bulkCategory,
                })
              }
              disabled={bulkCategoryMutation.isPending}
            >
              Apply
            </Button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete selected
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">
            Clear selection
          </Button>
        </div>
      )}

      {/* Edit Dialog (single photo) */}
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
                    setEditingPhoto((prev) => (prev ? { ...prev, category: value } : null))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  {/* position="popper" enables viewport-aware collision detection so the
                      list flips upward when there isn't enough space below, preventing
                      the last option (Portraits) from being clipped off screen. */}
                  <SelectContent position="popper" sideOffset={4}>
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
                    setEditingPhoto((prev) => (prev ? { ...prev, alt: e.target.value } : null))
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} photo(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected photos from the portfolio. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photos Grid */}
      {visiblePhotos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>
            {filterCategory === "All"
              ? "No portfolio photos yet. Click 'Add Photos' above."
              : `No photos in "${filterCategory}" yet.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visiblePhotos.map((photo, index) => {
            const isSelected = selectedIds.has(photo.id);
            return (
              <div
                key={photo.id}
                draggable={!isSelectMode}
                onDragStart={() => handleDragStart(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onClick={(e) => {
                  if (isSelectMode) toggleSelection(index, photo.id, e.shiftKey);
                }}
                title={isSelectMode ? "Click to select (shift-click for range)" : "Drag to reorder"}
                className={`relative rounded-lg overflow-hidden bg-muted transition-all will-change-transform ${
                  isSelectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                } ${draggedIndex === index ? "opacity-50 scale-95" : ""} ${
                  dragOverIndex === index ? "ring-2 ring-primary ring-offset-2 scale-105" : ""
                } ${isSelected ? "ring-4 ring-primary ring-offset-2" : ""}`}
              >
                <img
                  src={cdn(photo.thumbnail_url || photo.url)}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[3/4] object-cover pointer-events-none"
                />

                {/* Top-left: selection checkbox OR drag handle */}
                <div className="absolute top-2 left-2">
                  {isSelectMode ? (
                    <div className="h-8 w-8 rounded-md bg-background/90 flex items-center justify-center shadow">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(index, photo.id, false)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-md bg-background/90 flex items-center justify-center shadow">
                      <GripVertical className="w-4 h-4 text-foreground" />
                    </div>
                  )}
                </div>

                {/* Top-right: per-card actions (hidden in select mode) */}
                {!isSelectMode && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPhoto(photo);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(photo.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {/* Bottom: category + order index */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center justify-between">
                  <span className="text-xs text-white/90">{photo.category}</span>
                  <span className="text-xs text-white/60">#{index + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
