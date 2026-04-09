import JSZip from 'jszip';

export interface DownloadPhoto {
  url: string;
  title?: string | null;
}

export interface DownloadProgress {
  current: number;
  total: number;
  phase: 'downloading' | 'creating' | 'complete';
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const BATCH_SIZE = 10; // Download 10 photos at a time
const FETCH_TIMEOUT = 30000; // 30 second timeout per photo

async function fetchPhotoWithTimeout(url: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.warn(`Failed to fetch photo: ${url}`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function downloadAlbumAsZip(
  photos: DownloadPhoto[],
  albumTitle: string,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<void> {
  const zip = new JSZip();
  const total = photos.length;
  let downloaded = 0;

  // Download in batches
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    // Check if download was cancelled
    if (abortSignal?.aborted) {
      throw new Error('Download cancelled');
    }

    const batch = photos.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(
      batch.map(async (photo, batchIndex) => {
        const globalIndex = i + batchIndex;
        const arrayBuffer = await fetchPhotoWithTimeout(photo.url);
        
        downloaded++;
        onProgress?.({
          current: downloaded,
          total,
          phase: 'downloading'
        });

        return { photo, arrayBuffer, index: globalIndex };
      })
    );

    // Add successful downloads to ZIP
    for (const { photo, arrayBuffer, index } of results) {
      if (arrayBuffer) {
        const extension = photo.url.split('.').pop()?.split('?')[0] || 'jpg';
        const fileName = photo.title 
          ? `${photo.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.${extension}`
          : `photo_${String(index + 1).padStart(3, '0')}.${extension}`;
        zip.file(fileName, arrayBuffer);
      }
    }
  }

  // Check if we have any files
  if (Object.keys(zip.files).length === 0) {
    throw new Error('No photos could be downloaded');
  }

  onProgress?.({
    current: total,
    total,
    phase: 'creating'
  });

  // Generate ZIP
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Download the ZIP file
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${albumTitle.replace(/[^a-zA-Z0-9-_]/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({
    current: total,
    total,
    phase: 'complete'
  });
}
