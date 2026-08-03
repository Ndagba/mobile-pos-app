import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessedImageResult {
  imageUrl: string;
  thumbnailUrl: string;
}

/**
 * Validates, resizes, and saves a base64 encoded product image.
 * Generates both a main optimized image (600x600) and a thumbnail (150x150).
 */
export async function processAndSaveImage(base64Data: string, storeId: string): Promise<ProcessedImageResult> {
  // Extract content type and base64 string
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 image data');
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  // Validate format
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error('Unsupported image format. Allowed formats: JPG, JPEG, PNG, WebP');
  }

  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Generate unique base filename, prefixed by storeId to isolate caches
  const uniqueId = uuidv4();
  const baseFilename = `store_${storeId}_${uniqueId}`;
  
  const mainFilename = `${baseFilename}.jpg`;
  const thumbFilename = `${baseFilename}_thumb.jpg`;

  const mainPath = path.join(uploadsDir, mainFilename);
  const thumbPath = path.join(uploadsDir, thumbFilename);

  // Resize and compress main image (max 600px width/height, 80% quality JPG)
  await sharp(buffer)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(mainPath);

  // Generate thumbnail (max 150px width/height, 75% quality JPG)
  await sharp(buffer)
    .resize(150, 150, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toFile(thumbPath);

  return {
    imageUrl: `/uploads/${mainFilename}`,
    thumbnailUrl: `/uploads/${thumbFilename}`
  };
}
