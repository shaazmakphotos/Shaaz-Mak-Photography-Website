import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ArrowRight, Camera, Heart, Users, Lock } from "lucide-react";
import { Lightbox } from "@/components/portfolio/Lightbox";
import { supabase } from "@/integrations/supabase/client";
import { cdn, srcset } from "@/lib/cdn";
import logo from "@/assets/logo.png";
// Hero images live in /public/hero/ as pre-encoded WebP — they are NOT bundled
// into the JS, so they don't bloat the initial download. The first one is
// preloaded from index.html for the LCP.
const heroImages = ["/hero/hero-1.webp", "/hero/hero-2.webp", "/hero/hero-3.webp", "/hero/hero-4.webp"];
interface HomepagePhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  preview_url: string | null;
  alt: string;
  sort_order: number;
  width: number | null;
  height: number | null;
}
const services = [{
  icon: Heart,
  title: "Weddings",
  description: "Capturing your special day with timeless elegance and authentic emotion."
}, {
  icon: Users,
  title: "Engagements",
  description: "Celebrating your love story in beautiful, candid moments."
}, {
  icon: Camera,
  title: "Events",
  description: "Documenting life's milestones with artistic vision and attention to detail."
}];
const Index = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Rotate hero images every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroIndex(prev => (prev + 1) % heroImages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  const {
    data: homepagePhotos = [],
    isLoading
  } = useQuery({
    queryKey: ["homepage-photos-public"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("homepage_photos").select("*").order("sort_order", {
        ascending: true
      });
      if (error) throw error;
      return data as HomepagePhoto[];
    }
  });

  // Measure dimensions client-side for legacy photos that lack stored values.
  // Falls back to 3:2 placeholder until measured; no-op once backfill-variants runs.
  const [measuredDims, setMeasuredDims] = useState<Record<string, { w: number; h: number }>>({});
  useEffect(() => {
    const missing = homepagePhotos.filter((img) => !img.width || !img.height);
    if (missing.length === 0) return;
    missing.forEach((img) => {
      const el = new Image();
      el.onload = () =>
        setMeasuredDims((prev) => ({ ...prev, [img.id]: { w: el.naturalWidth, h: el.naturalHeight } }));
      el.src = img.thumbnail_url || img.url;
    });
  }, [homepagePhotos]);

  const albumPhotos = homepagePhotos.map(img => {
    const measured = measuredDims[img.id];
    return {
      src: cdn(img.preview_url || img.url),
      width:  img.width  || measured?.w || 1500,
      height: img.height || measured?.h || 1000,
      alt: img.alt,
      key: img.id,
    };
  });

  const lightboxImages = homepagePhotos.map(img => ({
    src: cdn(img.preview_url || img.url),
    alt: img.alt
  }));
  return <Layout>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Images - Rotating */}
        {heroImages.map((image, index) => {
        // Apply special mobile positioning for hero images that need adjustment
        const getPositionClass = (idx: number) => {
          if (idx === 0) return "bg-[70%_center] sm:bg-center"; // Celebration photo
          if (idx === 1) return "bg-[30%_center] sm:bg-center"; // Black dress photo
          return "bg-center";
        };
        const positionClass = getPositionClass(index);
        return <div key={index} className={`absolute inset-0 bg-cover ${positionClass} bg-no-repeat transition-opacity duration-1000 ${index === currentHeroIndex ? "opacity-100" : "opacity-0"}`} style={{
          backgroundImage: `url(${image})`
        }} />;
      })}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />

        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto fade-in-up">
          <img src={logo} alt="Shaaz Mak" className="h-40 sm:h-48 lg:h-40 w-auto mx-auto mb-6" />
          <p className="max-w-2xl mx-auto mb-10 leading-relaxed text-secondary-foreground">Weddings • Engagements • Anniversaries • The Moments In Between</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-gold hover:bg-gold/90 text-background font-medium px-8">
              <Link to="/portfolio">
                View Portfolio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-foreground/20 hover:bg-foreground/5">
              <Link to="/contact">Get in Touch</Link>
            </Button>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-foreground/30 rounded-full flex justify-center pt-2">
            <div className="w-1 h-2 bg-foreground/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Featured Work Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-gold uppercase tracking-[0.2em] text-sm mb-4 font-sans">Portfolio</p>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground mb-4">Featured Work</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A glimpse into the stories I've had the honor of capturing
            </p>
          </div>

          {isLoading ? <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div> : homepagePhotos.length === 0 ? <div className="text-center py-12 text-muted-foreground">
              <p>Featured photos coming soon.</p>
            </div> : <RowsPhotoAlbum photos={albumPhotos} targetRowHeight={300} rowConstraints={{
          minPhotos: 1,
          maxPhotos: 4
        }} spacing={8} onClick={({
          index
        }) => setSelectedIndex(index)} componentsProps={{
          container: {
            className: "cursor-pointer"
          },
          image: {
            className: "transition-transform duration-500 hover:scale-[1.02]",
            loading: "lazy"
          }
        }} />}

          <div className="text-center mt-12">
            <Button asChild variant="outline" className="border-gold text-gold hover:bg-gold hover:text-background">
              <Link to="/portfolio">
                View Full Portfolio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-cream/50 dark:bg-secondary/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-gold uppercase tracking-[0.2em] text-sm mb-4 font-sans">Services</p>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground mb-4">What I Offer</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Professional photography services tailored to capture your most meaningful moments
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {services.map((service, index) => <div key={index} className="bg-background rounded-lg p-8 text-center shadow-soft hover-lift transition-all duration-300">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gold/10 flex items-center justify-center">
                  <service.icon className="w-8 h-8 text-gold" />
                </div>
                <h3 className="font-serif text-2xl text-foreground mb-4">{service.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{service.description}</p>
              </div>)}
          </div>

          <div className="text-center mt-12">
            <Button asChild size="lg" className="bg-gold hover:bg-gold/90 text-background">
              <Link to="/contact">
                Book a Session
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Client Portal CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-secondary/50 to-secondary/30 dark:from-secondary/30 dark:to-secondary/10 rounded-2xl p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gold/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gold/10 flex items-center justify-center">
                <Lock className="w-8 h-8 text-gold" />
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl text-foreground mb-4">Client Portal</h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
                Already a client? Access your private gallery to view, download, and share your beautiful photographs
                with family and friends.
              </p>
              <Button asChild size="lg" variant="outline" className="border-gold text-gold hover:bg-gold hover:text-background">
                <Link to="/login">
                  Access Your Gallery
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      <Lightbox images={lightboxImages} selectedIndex={selectedIndex} onClose={() => setSelectedIndex(null)} onIndexChange={setSelectedIndex} />
    </Layout>;
};
export default Index;