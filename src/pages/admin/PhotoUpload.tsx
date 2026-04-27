import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Upload, Trash2, Star, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RowsPhotoAlbum, RenderImageContext, RenderImageProps } from "react-photo-album";
import "react-photo-album/rows.css";
import { uploadAndProcessPhoto } from "@/lib/uploadPhoto";
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
  cover_photo_url: string | null;
  client_id: string;
}

export function PhotoUpload() {
  const { albumId } = useParams<{ albumId: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (albumId) {
      fetchAlbumAndPhotos();
    }
  }, [albumId]);

  const fetchAlbumAndPhotos = async () => {
    try {
      const { data: albumData, error: albumError } = await supabase
        .from('albums')
        .select('*')
        .eq('id', albumId)
        .single();

      if (albumError) throw albumError;
      setAlbum(albumData);

      const { data: photosData, error: photosError } = await supabase
        .from('photos')
        .select('*')
        .eq('album_id', albumId)
        .order('sort_order', { ascending: true });

      if (photosError) throw photosError;
      setPhotos(photosData || []);
    } catch (error) {
      console.error('Error fetching album:', error);
      toast({
        title: "Error",
        description: "Failed to load album.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !albumId) return;

    setIsUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let uploadedCount = 0;

    try {
      for (const file of Array.from(files)) {
        // New pipeline: upload original + generate WebP variants via Edge Function.
        const processed = await uploadAndProcessPhoto(file, albumId);

        const { error: insertError } = await supabase
          .from('photos')
          .insert({
            album_id: albumId,
            url: processed.url,
            thumbnail_url: processed.thumbnail_url,
            preview_url: processed.preview_url,
            sort_order: photos.length + uploadedCount,
            width: processed.width,
            height: processed.height,
          });

        if (insertError) throw insertError;

        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / totalFiles) * 100));
      }

      toast({
        title: "Upload complete!",
        description: `${uploadedCount} photo(s) uploaded successfully.`,
      });

      fetchAlbumAndPhotos();
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload photos.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSetCover = async (photoUrl: string) => {
    if (!album) return;

    try {
      const { error } = await supabase
        .from('albums')
        .update({ cover_photo_url: photoUrl })
        .eq('id', album.id);

      if (error) throw error;

      setAlbum({ ...album, cover_photo_url: photoUrl });
      toast({
        title: "Cover updated",
        description: "Album cover photo has been set.",
      });
    } catch (error) {
      console.error('Error setting cover:', error);
      toast({
        title: "Error",
        description: "Failed to set cover photo.",
        variant: "destructive",
      });
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    try {
      // Extract the file path from the URL
      const urlParts = photo.url.split('/photos/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('photos').remove([filePath]);
      }

      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;

      setPhotos(photos.filter(p => p.id !== photo.id));
      toast({
        title: "Photo deleted",
        description: "Photo has been removed from the album.",
      });
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast({
        title: "Error",
        description: "Failed to delete photo.",
        variant: "destructive",
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      const element = e.target as HTMLElement;
      element.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const element = e.target as HTMLElement;
    element.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder photos array
    const newPhotos = [...photos];
    const [draggedPhoto] = newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(dropIndex, 0, draggedPhoto);

    // Optimistic update - update local state immediately
    setPhotos(newPhotos);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Batch update sort_order in database with single upsert
    try {
      const updates = newPhotos.map((photo, index) => ({
        id: photo.id,
        album_id: albumId!,
        url: photo.url,
        sort_order: index,
      }));

      const { error } = await supabase
        .from('photos')
        .upsert(updates, { onConflict: 'id' });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating photo order:', error);
      // Revert on error
      fetchAlbumAndPhotos();
      toast({
        title: "Error",
        description: "Failed to save photo order.",
        variant: "destructive",
      });
    }
  };

  // Transform photos for react-photo-album. Dimensions come straight from the
  // database now (process-upload writes them on insert), so there is no
  // runtime probe and no layout shift.
  const albumPhotos = photos.map((photo, index) => ({
    src: cdn(photo.thumbnail_url || photo.url),
    width: photo.width || 1000,
    height: photo.height || 1000,
    alt: photo.title || "Photo",
    key: photo.id,
    // Custom data
    photoId: photo.id,
    photoUrl: photo.url,
    photoData: photo,
    index,
  }));

  // Custom image renderer with drag-and-drop support
  const renderImage = (
    { alt, title, ...rest }: RenderImageProps,
    { photo, width, height }: RenderImageContext
  ) => {
    const customPhoto = photo as typeof albumPhotos[0];
    const index = customPhoto.index;
    const photoData = customPhoto.photoData;
    const isCover = album?.cover_photo_url === customPhoto.photoUrl;

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, index)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, index)}
        className={`group relative cursor-grab active:cursor-grabbing transition-all ${
          dragOverIndex === index ? 'ring-2 ring-primary ring-offset-2 scale-105' : ''
        } ${draggedIndex === index ? 'opacity-50 scale-95' : ''}`}
        style={{
          width: "100%",
          position: "relative",
          aspectRatio: `${width} / ${height}`,
        }}
      >
        <img
          src={customPhoto.src}
          alt={alt}
          title={title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        
        {/* Drag handle indicator */}
        <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        
        {isCover && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-medium">
            Cover
          </div>
        )}

        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleSetCover(customPhoto.photoUrl);
            }}
            disabled={isCover}
          >
            <Star className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDeletePhoto(photoData);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Album not found.</p>
        <Link to="/admin">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-serif font-medium">{album.title}</h2>
            <p className="text-muted-foreground">{photos.length} photos • Drag to reorder</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              asChild
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isUploading}
            >
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? `Uploading ${uploadProgress}%` : "Upload Photos"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-lg border border-dashed border-border">
          <Upload className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No photos in this album yet</p>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button variant="outline" asChild className="border-primary/30">
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First Photos
              </span>
            </Button>
          </label>
        </div>
      ) : (
        <RowsPhotoAlbum
          photos={albumPhotos}
          targetRowHeight={250}
          rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
          spacing={8}
          render={{ image: renderImage }}
        />
      )}
    </div>
  );
}
