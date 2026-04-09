import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { cdn, srcset } from "@/lib/cdn";

interface Photo {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
}

interface ShareData {
  album_title: string;
  photos: Photo[];
  is_full_album: boolean;
}

export default function SharedAlbum() {
  const { token } = useParams<{ token: string }>();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (token) {
      fetchSharedAlbum();
    }
  }, [token]);

  const fetchSharedAlbum = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-share-token', {
        body: { token }
      });

      if (fnError) {
        console.error('Error calling validate-share-token:', fnError);
        setError("This share link is invalid or has expired.");
        setIsLoading(false);
        return;
      }

      if (data.error) {
        console.error('Share token validation error:', data.error);
        setError(data.error);
        setIsLoading(false);
        return;
      }

      setShareData({
        album_title: data.album_title || "Shared Album",
        photos: data.photos || [],
        is_full_album: data.is_full_album,
      });
    } catch (err: any) {
      console.error('Failed to load shared album:', err);
      setError("Failed to load the shared album.");
    } finally {
      setIsLoading(false);
    }
  };

  const photos = shareData?.photos ?? [];

  // Measure dimensions client-side for legacy photos that lack stored values.
  const [measuredDims, setMeasuredDims] = useState<Record<string, { w: number; h: number }>>({});
  useEffect(() => {
    const missing = photos.filter((p) => !p.width || !p.height);
    if (missing.length === 0) return;
    missing.forEach((p) => {
      const el = new Image();
      el.onload = () =>
        setMeasuredDims((prev) => ({ ...prev, [p.id]: { w: el.naturalWidth, h: el.naturalHeight } }));
      el.src = p.thumbnail_url || p.url;
    });
  }, [photos]);

  const albumPhotos = photos.map((photo) => {
    const measured = measuredDims[photo.id];
    return {
      src: cdn(photo.thumbnail_url || photo.url),
      srcSet: srcset(
        [photo.thumbnail_url, 480],
        [photo.preview_url, 1600],
      ),
      width:  photo.width  || measured?.w || 1500,
      height: photo.height || measured?.h || 1000,
      alt: photo.title || "Photo",
    };
  });

  // Lightbox uses preview_url for fast viewing.
  const lightboxImages = photos.map((photo) => ({
    src: cdn(photo.preview_url || photo.url),
    alt: photo.title || "Photo",
  }));

  const goToPrevious = () => {
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  const goToNext = () => {
    if (lightboxIndex !== null && lightboxIndex < lightboxImages.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "Escape") setLightboxIndex(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, lightboxImages.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading album...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-secondary rounded-full flex items-center justify-center">
            <Camera className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-serif mb-4">{error}</h1>
          <p className="text-muted-foreground mb-8">
            The link you followed may be incorrect or the album may no longer be available.
          </p>
          <Link
            to="/"
            className="text-primary hover:text-accent transition-colors font-medium"
          >
            Visit Shaaz Mak Photography
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="py-8 border-b border-border">
        <div className="container mx-auto px-6 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-serif text-foreground hover:text-primary transition-colors">
              Shaaz Mak Photography
            </h1>
          </Link>
        </div>
      </header>

      {/* Album Info */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-6 text-center">
          <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm mb-4">
            Shared Album
          </p>
          <h2 className="text-4xl md:text-5xl font-serif mb-4">
            {shareData?.album_title}
          </h2>
          <p className="text-muted-foreground">
            {shareData?.photos.length} photo{shareData?.photos.length !== 1 ? "s" : ""}
            {!shareData?.is_full_album && " selected for you"}
          </p>
        </div>
      </section>

      {/* Photos Grid */}
      <section className="py-8 pb-20 bg-background">
        <div className="container mx-auto px-6">
          {photos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {shareData?.photos.length ? "Loading photos..." : "No photos to display."}
              </p>
            </div>
          ) : (
            <RowsPhotoAlbum
              photos={albumPhotos}
              targetRowHeight={300}
              rowConstraints={{ minPhotos: 1, maxPhotos: 4 }}
              spacing={8}
              onClick={({ index }) => setLightboxIndex(index)}
              componentsProps={{
                container: { className: "cursor-pointer" },
                image: { 
                  className: "transition-transform duration-500 hover:scale-[1.02]",
                  loading: "lazy"
                },
              }}
            />
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border bg-secondary/30">
        <div className="container mx-auto px-6 text-center">
          <p className="text-muted-foreground text-sm">
            Photographed by{" "}
            <Link to="/" className="text-primary hover:text-accent transition-colors">
              Shaaz Mak Photography
            </Link>
          </p>
        </div>
      </footer>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-6 right-6 text-foreground hover:text-primary transition-colors z-10"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="w-8 h-8" />
          </button>

          {/* Previous button */}
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 text-foreground hover:text-primary transition-colors z-10 p-2"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}

          {/* Next button */}
          {lightboxIndex < lightboxImages.length - 1 && (
            <button
              className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 text-foreground hover:text-primary transition-colors z-10 p-2"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
            >
              <ChevronRight className="w-10 h-10" />
            </button>
          )}

          {/* Image counter */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-foreground/70 text-sm z-10">
            {lightboxIndex + 1} / {lightboxImages.length}
          </div>

          {/* Image */}
          <img
            src={lightboxImages[lightboxIndex].src}
            alt={lightboxImages[lightboxIndex].alt}
            className="max-w-full max-h-[90vh] object-contain shadow-elevated animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
