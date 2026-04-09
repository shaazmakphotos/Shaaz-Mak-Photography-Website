import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  images: { src: string; alt?: string }[];
  selectedIndex: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function Lightbox({ images, selectedIndex, onClose, onIndexChange }: LightboxProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const goToPrevious = useCallback(() => {
    if (selectedIndex !== null && selectedIndex > 0) {
      onIndexChange(selectedIndex - 1);
    }
  }, [selectedIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      onIndexChange(selectedIndex + 1);
    }
  }, [selectedIndex, images.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, goToPrevious, goToNext, onClose]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (diff > 50) goToNext();
    if (diff < -50) goToPrevious();
    setTouchStart(null);
  };

  if (selectedIndex === null) return null;

  const currentImage = images[selectedIndex];
  const hasPrevious = selectedIndex > 0;
  const hasNext = selectedIndex < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        className="absolute top-6 right-6 text-foreground hover:text-primary transition-colors z-10"
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>

      {/* Image counter */}
      <div className="absolute top-6 left-6 text-foreground/70 text-sm font-medium">
        {selectedIndex + 1} / {images.length}
      </div>

      {/* Previous button */}
      {hasPrevious && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-foreground/70 hover:text-foreground bg-background/50 hover:bg-background/80 rounded-full transition-all z-10"
          onClick={(e) => {
            e.stopPropagation();
            goToPrevious();
          }}
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-foreground/70 hover:text-foreground bg-background/50 hover:bg-background/80 rounded-full transition-all z-10"
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Image */}
      <img
        src={currentImage.src}
        alt={currentImage.alt || "Gallery image"}
        className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain shadow-elevated animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
