import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Download, LogOut, Loader2, X } from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { Lightbox } from "@/components/portfolio/Lightbox";
import { downloadAlbumAsZip, DownloadProgress } from "@/lib/downloadHelper";
import { cdn, srcset } from "@/lib/cdn";

interface Photo {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url: string | null;
  title: string | null;
  sort_order: number | null;
  width: number | null;
  height: number | null;
}

interface Album {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  cover_photo_url: string | null;
}

export default function MyAlbum() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchAlbums();
    }
  }, [user]);

  const fetchAlbums = async () => {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('client_id', user?.id)
        .order('event_date', { ascending: false });

      if (error) throw error;

      setAlbums(data || []);
      if (data && data.length > 0) {
        setSelectedAlbum(data[0]);
        fetchPhotos(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching albums:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPhotos = async (albumId: string) => {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('album_id', albumId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error('Error fetching photos:', error);
    }
  };

  const handleAlbumSelect = (album: Album) => {
    setSelectedAlbum(album);
    fetchPhotos(album.id);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleDownloadPhoto = async (photo: Photo) => {
    setDownloadingPhotoId(photo.id);
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extension = photo.url.split('.').pop()?.split('?')[0] || 'jpg';
      a.download = photo.title ? `${photo.title}.${extension}` : `photo.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Download started" });
    } catch (error) {
      console.error('Download error:', error);
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloadingPhotoId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!selectedAlbum || photos.length === 0) return;
    
    setIsDownloading(true);
    setDownloadProgress("Preparing download...");
    abortControllerRef.current = new AbortController();

    try {
      const downloadPhotos = photos.map(p => ({
        url: p.url,
        title: p.title
      }));

      await downloadAlbumAsZip(
        downloadPhotos,
        selectedAlbum.title,
        (progress: DownloadProgress) => {
          if (progress.phase === 'downloading') {
            const percent = Math.round((progress.current / progress.total) * 100);
            setDownloadProgress(`Downloading ${progress.current} of ${progress.total} photos (${percent}%)`);
          } else if (progress.phase === 'creating') {
            setDownloadProgress("Creating ZIP file...");
          }
        },
        abortControllerRef.current.signal
      );

      toast({ title: "Download complete", description: "Your ZIP file has been downloaded." });
    } catch (error: any) {
      if (error.message === 'Download cancelled') {
        toast({ title: "Download cancelled" });
      } else {
        console.error('ZIP download error:', error);
        toast({ 
          title: "Download failed", 
          description: error.message || "Failed to download album", 
          variant: "destructive" 
        });
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress("");
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    abortControllerRef.current?.abort();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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

  // Transform to react-photo-album format
  const albumPhotos = photos.map((img) => {
    const measured = measuredDims[img.id];
    return {
      src: cdn(img.thumbnail_url || img.url),
      srcSet: srcset(
        [img.thumbnail_url, 480],
        [img.preview_url, 1600],
      ),
      width:  img.width  || measured?.w || 1500,
      height: img.height || measured?.h || 1000,
      alt: img.title || "Photo",
      key: img.id,
    };
  });

  // Lightbox uses preview_url for fast viewing; downloads still hit `url` (full-res original).
  const lightboxImages = photos.map((p) => ({
    src: cdn(p.preview_url || p.url),
    alt: p.title || "Photo",
  }));

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-medium text-foreground mb-2">
                Your Albums
              </h1>
              <p className="text-muted-foreground">
                Browse and download your photos
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="border-border/50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {albums.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 border border-border/50">
              <p className="text-muted-foreground text-lg">
                No albums available yet.
              </p>
              <p className="text-muted-foreground mt-2">
                Your photographer will add your photos soon!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Album Sidebar */}
              {albums.length > 1 && (
                <div className="lg:col-span-1">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    Albums
                  </h3>
                  <div className="space-y-2">
                    {albums.map((album) => (
                      <button
                        key={album.id}
                        onClick={() => handleAlbumSelect(album)}
                        className={`w-full text-left p-4 border transition-all ${
                          selectedAlbum?.id === album.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border/50 hover:border-primary/50'
                        }`}
                      >
                        <p className="font-medium">{album.title}</p>
                        {album.event_date && (
                          <p className="text-sm text-muted-foreground">
                            {formatDate(album.event_date)}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos Grid */}
              <div className={albums.length > 1 ? 'lg:col-span-3' : 'lg:col-span-4'}>
                {selectedAlbum && (
                  <>
                    <div className="mb-6 flex flex-col gap-4">
                      <div>
                        <h2 className="text-2xl font-serif font-medium">
                          {selectedAlbum.title}
                        </h2>
                        {selectedAlbum.description && (
                          <p className="text-muted-foreground mt-1">
                            {selectedAlbum.description}
                          </p>
                        )}
                        {selectedAlbum.event_date && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatDate(selectedAlbum.event_date)}
                          </p>
                        )}
                      </div>
                      {photos.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={handleDownloadAll}
                              disabled={isDownloading}
                              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
                            >
                              {isDownloading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4 mr-2" />
                              )}
                              {isDownloading ? "Downloading..." : "Download All (ZIP)"}
                            </Button>
                            {isDownloading && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCancelDownload}
                                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {downloadProgress && (
                            <p className="text-sm text-muted-foreground animate-pulse">
                              {downloadProgress}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {photos.length === 0 ? (
                      <div className="text-center py-12 bg-muted/30 border border-border/50">
                        <p className="text-muted-foreground">
                          {photos.length > 0 
                            ? "Please wait for photos to load..." 
                            : "Photos coming soon!"}
                        </p>
                      </div>
                    ) : (
                      <RowsPhotoAlbum
                        photos={albumPhotos}
                        targetRowHeight={300}
                        rowConstraints={{ minPhotos: 1, maxPhotos: 4 }}
                        spacing={8}
                        onClick={({ index }) => setSelectedIndex(index)}
                        componentsProps={{
                          container: { className: "cursor-pointer" },
                          image: { 
                            className: "transition-transform duration-500 hover:scale-[1.02]",
                            loading: "lazy"
                          },
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Lightbox with Download */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center"
          onClick={() => setSelectedIndex(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-6 right-6 text-foreground hover:text-primary transition-colors z-10"
            onClick={() => setSelectedIndex(null)}
          >
            <span className="sr-only">Close</span>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Download button */}
          <button
            className="absolute top-6 right-20 text-foreground hover:text-primary transition-colors z-10 p-2"
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadPhoto(photos[selectedIndex]);
            }}
            disabled={downloadingPhotoId === photos[selectedIndex]?.id}
          >
            {downloadingPhotoId === photos[selectedIndex]?.id ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Download className="w-6 h-6" />
            )}
          </button>

          {/* Image counter */}
          <div className="absolute top-6 left-6 text-foreground/70 text-sm font-medium">
            {selectedIndex + 1} / {photos.length}
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
          {selectedIndex < photos.length - 1 && (
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

          {/* Image */}
          <img
            src={lightboxImages[selectedIndex]?.src}
            alt={lightboxImages[selectedIndex]?.alt || "Photo"}
            className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain shadow-elevated animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}
