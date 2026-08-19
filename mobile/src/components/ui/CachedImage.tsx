import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import ImageCacheService from '../../services/ImageCacheService';
import DatabaseService from '../../services/DatabaseService';

interface CachedImageProps {
  source: string; // Remote URL or local file path
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

export function CachedImage({ source, style, resizeMode = 'cover' }: CachedImageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const resolveImage = async () => {
      if (!source) return;
      if (source.startsWith('file://') || source.startsWith('data:')) {
        if (isMounted) setLocalUri(source);
        return;
      }

      const storeId = DatabaseService.getStoreId() || 'default';
      const cachedPath = await ImageCacheService.getCachedImageUri(source, storeId);
      if (isMounted) {
        setLocalUri(cachedPath);
      }
    };

    resolveImage();

    return () => {
      isMounted = false;
    };
  }, [source]);

  // Fallback to the remote URL if the cached local path is not yet resolved
  const activeSource = localUri ? { uri: localUri } : { uri: source };

  return (
    <Image
      source={activeSource}
      style={style}
      resizeMode={resizeMode}
    />
  );
}
