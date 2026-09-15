import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Share2,
  Check,
  X,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { gridSrc, lightboxSrc, measureSrc, toGridPhoto } from "@/lib/photoUrls";
import { renderAlbumImage } from "@/components/album/renderAlbumImage";
import type { User } from "@supabase/supabase-js";

interface Photo {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url?: string | null;
  title: string | null;
  sort_order: number;
  width?: number;
  height?: number;
}

interface Album {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
}

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosWithDimensions, setPhotosWithDimensions] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user && id) {
      fetchAlbum();
      fetchPhotos();
    }
  }, [user, id]);

  // Prefer stored dimensions. Only probe a real variant URL when missing —
  // never load a full-res original just to learn aspect ratio.
  useEffect(() => {
    let cancelled = false;

    const loadDimensions = async () => {
      if (photos.length === 0) {
        setPhotosWithDimensions([]);
        return;
      }

      const dimensionsMap = new Map<string, { width: number; height: number }>();

      await Promise.all(
        photos.map(async (photo) => {
          if (photo.width && photo.height) {
            dimensionsMap.set(photo.id, { width: photo.width, height: photo.height });
            return;
          }
          const src = measureSrc(photo);
          if (!src) {
            dimensionsMap.set(photo.id, { width: 1500, height: 1000 });
            return;
          }
          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 1500, height: 1000 });
            img.src = src;
          });
          dimensionsMap.set(photo.id, dims);
        })
      );

      if (cancelled) return;
      setPhotosWithDimensions(
        photos.map((p) => ({
          ...p,
          width: dimensionsMap.get(p.id)?.width || p.width || 1500,
          height: dimensionsMap.get(p.id)?.height || p.height || 1000,
        }))
      );
    };

    loadDimensions();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const fetchAlbum = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("albums")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      toast({
        title: "Error",
        description: "Album not found.",
        variant: "destructive",
      });
      navigate("/dashboard");
    } else {
      setAlbum(data);
    }
  };

  const fetchPhotos = async () => {
    if (!id) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("album_id", id)
      .order("sort_order", { ascending: true });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load photos.",
        variant: "destructive",
      });
    } else {
      setPhotos(data || []);
    }

    setIsLoading(false);
  };

  const togglePhotoSelection = (photoId: string) => {
    const newSelection = new Set(selectedPhotos);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotos(newSelection);
  };

  const selectAll = () => {
    setSelectedPhotos(new Set(photos.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedPhotos(new Set());
  };

  const generateShareLink = async (shareAll: boolean) => {
    if (!user || !album) return;
    setIsCreatingLink(true);

    try {
      const token = crypto.randomUUID();

      const { data: shareLink, error: linkError } = await supabase
        .from("share_links")
        .insert({
          album_id: album.id,
          created_by: user.id,
          token,
          is_full_album: shareAll,
        })
        .select()
        .single();

      if (linkError) throw linkError;

      if (!shareAll && selectedPhotos.size > 0) {
        const sharedPhotosData = Array.from(selectedPhotos).map((photoId) => ({
          share_link_id: shareLink.id,
          photo_id: photoId,
        }));

        const { error: photosError } = await supabase
          .from("shared_photos")
          .insert(sharedPhotosData);

        if (photosError) throw photosError;
      }

      const shareUrl = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(shareUrl);

      toast({
        title: "Link Created!",
        description: "Share link copied to clipboard.",
      });

      setIsSelecting(false);
      clearSelection();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create share link.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingLink(false);
    }
  };

  // Grid: real thumbnails only — never the download original.
  const albumPhotos = photosWithDimensions.map((img) =>
    toGridPhoto(img, img.width && img.height ? { w: img.width, h: img.height } : null)
  );

  // Lightbox: preview → thumb → original (last resort when opened).
  const lightboxImages = photosWithDimensions.map((p) => ({
    src: lightboxSrc(p),
    alt: p.title || "Photo",
  }));

  return (
    <Layout showFooter={false}>
      <section className="pt-32 pb-16 min-h-screen bg-background">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/dashboard"
              className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Albums
            </Link>

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-serif">
                  {album?.title || "Loading..."}
                </h1>
                {album?.description && (
                  <p className="text-muted-foreground mt-2">{album.description}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {photos.length} photos
                </p>
              </div>

              <div className="flex gap-3">
                {isSelecting ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsSelecting(false);
                        clearSelection();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button variant="outline" onClick={selectAll}>
                      Select All
                    </Button>
                    <Button
                      onClick={() => generateShareLink(false)}
                      disabled={selectedPhotos.size === 0 || isCreatingLink}
                      className="bg-primary text-primary-foreground hover:bg-accent"
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Share Selected ({selectedPhotos.size})
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsSelecting(true)}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Select Photos
                    </Button>
                    <Button
                      onClick={() => generateShareLink(true)}
                      disabled={isCreatingLink}
                      className="bg-primary text-primary-foreground hover:bg-accent"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share All
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Photos Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 bg-secondary flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-serif mb-2">No Photos Yet</h2>
              <p className="text-muted-foreground">
                Photos will appear here once they're uploaded.
              </p>
            </div>
          ) : isSelecting ? (
            // Selection mode - use custom grid with checkboxes
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {photosWithDimensions.map((photo) => (
                <div
                  key={photo.id}
                  className={cn(
                    "relative overflow-hidden group cursor-pointer aspect-square",
                    "ring-2 ring-transparent",
                    selectedPhotos.has(photo.id) && "ring-primary"
                  )}
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  {gridSrc(photo) ? (
                    <img
                      src={gridSrc(photo)!}
                      alt={photo.title || "Photo"}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-muted/50 animate-pulse"
                      aria-label={photo.title || "Photo processing"}
                    />
                  )}
                  <div
                    className={cn(
                      "absolute top-3 right-3 w-6 h-6 flex items-center justify-center transition-all",
                      selectedPhotos.has(photo.id)
                        ? "bg-primary border-primary"
                        : "bg-background/80 border-border"
                    )}
                    style={{ border: '2px solid' }}
                  >
                    {selectedPhotos.has(photo.id) && (
                      <Check className="w-4 h-4 text-primary-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Normal mode - use react-photo-album
            <RowsPhotoAlbum
              photos={albumPhotos}
              targetRowHeight={300}
              rowConstraints={{ minPhotos: 1, maxPhotos: 4 }}
              spacing={8}
              onClick={({ index }) => setSelectedIndex(index)}
              render={{ image: renderAlbumImage }}
              componentsProps={{
                container: { className: "cursor-pointer" },
              }}
              sizes={{
                size: "1100px",
                sizes: [
                  { viewport: "(max-width: 1024px)", size: "calc(100vw - 48px)" },
                ],
              }}
            />
          )}
        </div>
      </section>

      {/* Lightbox */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedIndex(null)}
        >
          <button
            className="absolute top-6 right-6 text-foreground hover:text-primary transition-colors"
            onClick={() => setSelectedIndex(null)}
          >
            <X className="w-8 h-8" />
          </button>

          {/* Image counter */}
          <div className="absolute top-6 left-6 text-foreground/70 text-sm font-medium">
            {selectedIndex + 1} / {photosWithDimensions.length}
          </div>

          {/* Previous button */}
          {selectedIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-foreground/70 hover:text-foreground bg-background/50 hover:bg-background/80 rounded-full transition-all z-10"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex(selectedIndex - 1);
              }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {selectedIndex < photosWithDimensions.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-foreground/70 hover:text-foreground bg-background/50 hover:bg-background/80 rounded-full transition-all z-10"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex(selectedIndex + 1);
              }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <img
            src={lightboxImages[selectedIndex]?.src}
            alt={lightboxImages[selectedIndex]?.alt || "Photo"}
            className="max-w-full max-h-[90vh] object-contain shadow-elevated animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}
