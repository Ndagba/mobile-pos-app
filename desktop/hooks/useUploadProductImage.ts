'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Upload a product image via `POST /v1/products/upload-image` (admin + manager).
 *
 * The backend expects a **full base64 data URI** (`data:image/png;base64,…`) —
 * exactly what `FileReader.readAsDataURL` produces — and returns the saved
 * `{ imageUrl, thumbnailUrl }`. The caller then stores `imageUrl` on the product
 * as `image_url`. Allowed formats: JPG/JPEG/PNG/WebP.
 */
export interface UploadedImage {
  imageUrl: string;
  thumbnailUrl: string;
}

export function useUploadProductImage() {
  return useMutation({
    mutationFn: (dataUri: string) =>
      apiClient.post<UploadedImage>('/products/upload-image', { image: dataUri }),
  });
}
