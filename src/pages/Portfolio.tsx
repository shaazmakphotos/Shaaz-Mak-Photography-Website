import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/portfolio/Lightbox";
import { supabase } from "@/integrations/supabase/client";
import { cdn, srcset } from "@/lib/cdn";

const categories = ["All", "Weddings", "Graduations", "Events", "Portraits"];

interface PortfolioPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url?: string | null;
  category: string;
  alt: string;
  sort_order: number;
  width: number | null;
  height: number | null;
}

export default function Portfolio() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { data: portfolioImages = [], isLoading } = useQuery({
    queryKey: ["portfolio-photos-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_photos")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as PortfolioPhoto[];
    },
  });

  const filteredImages =
    activeCategory === "All"
      ? portfolioImages
      : portfolioImages.filter((img) => img.category === activeCategory);

  // For legacy photos that don't yet have stored dimensions we measure them
  // client-side using a small thumbnail (fast). Once backfill-variants has run
  // every row will have dimensions and this effect becomes a no-op.
  const [measuredDims, setMeasuredDims] = useState<Record<string, { w: number; h: number }>>({});

  useEffect(() => {
    const missing = filteredImages.filter((img) => !img.width || !img.height);
    if (missing.length === 0) return;

    missing.forEach((img) => {
      const el = new Image();
      el.onload = () => {
        setMeasuredDims((prev) => ({
          ...prev,
          [img.id]: { w: el.naturalWidth, h: el.naturalHeight },
        }));
      };
      // Prefer thumbnail for quick measurement; fall back to full URL
      el.src = img.thumbnail_url || img.url;
    });
  }, [filteredImages]);

  // Transform to react-photo-album format. Width/height come from:
  //   1. Stored DB value (set by process-upload on new uploads)
  //   2. Client-side measurement for legacy rows (updates once image loads)
  //   3. 3:2 placeholder until measurement completes (avoids 1:1 squish)
  const albumPhotos = filteredImages.map((img) => {
    const measured = measuredDims[img.id];
    return {
      src: cdn(img.preview_url || img.url),
      width:  img.width  || measured?.w || 1500,
      height: img.height || measured?.h || 1000,
      alt: img.alt,
      key: img.id,
    };
  });

  // Lightbox uses the larger preview (CDN-backed) for fast viewing.
  const lightboxImages = filteredImages.map((img) => ({
    src: cdn(img.preview_url || img.url),
    alt: img.alt,
  }));

  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-16 bg-background">
        <div className="container mx-auto px-6 text-center">
          <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm mb-4">
            My Work
          </p>
          <h1 className="text-5xl md:text-6xl font-serif mb-6">Portfolio</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A curated collection of my favorite moments captured through the lens.
            Each photograph tells a unique story of love, joy, and celebration.
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 bg-background sticky top-16 z-40 border-b border-border/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "px-6 py-2 text-sm font-medium tracking-wider uppercase transition-all duration-300",
                  activeCategory === category
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground hover:bg-primary/10"
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No photos in this category yet.</p>
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
        </div>
      </section>

      {/* Lightbox */}
      <Lightbox
        images={lightboxImages}
        selectedIndex={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onIndexChange={setSelectedIndex}
      />
    </Layout>
  );
}
