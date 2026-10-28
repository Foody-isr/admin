/** Returns the cover followed by unique additional product photos. */
export function itemPhotos(item?: {
  image_url?: string;
  image_urls?: string[];
}): string[] {
  return Array.from(
    new Set(
      [item?.image_url, ...(item?.image_urls ?? [])].filter(
        (url): url is string => !!url,
      ),
    ),
  );
}

/** Validates a batch before uploading any selected product photo. */
export function validateItemPhotos(
  files: File[],
  currentCount: number,
): 'itemPhotosLimit' | 'itemPhotosInvalid' | null {
  if (currentCount + files.length > 10) return 'itemPhotosLimit';
  if (
    files.some(
      (file) =>
        !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
          file.type,
        ) || file.size > 5 * 1024 * 1024,
    )
  )
    return 'itemPhotosInvalid';
  return null;
}
