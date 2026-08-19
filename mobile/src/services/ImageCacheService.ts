import * as FileSystem from 'expo-file-system/legacy';

class ImageCacheService {
  /**
   * Get the local document directory path for a given remote image URL.
   */
  static getLocalPath(remoteUrl: string, storeId: string): string {
    const filename = remoteUrl.split('/').pop() || 'temp.jpg';
    return `${FileSystem.documentDirectory}caches/store_${storeId}/${filename}`;
  }

  /**
   * Ensures that the local cache directory for the specified store exists.
   */
  static async ensureDirectory(storeId: string): Promise<void> {
    const dir = `${FileSystem.documentDirectory}caches/store_${storeId}/`;
    try {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch (error) {
      console.error('Error ensuring image cache directory:', error);
    }
  }

  /**
   * Returns a local URI (file://...) for the image if it's cached,
   * otherwise downloads it in the background and returns the local URI.
   */
  static async getCachedImageUri(remoteUrl: string, storeId: string): Promise<string> {
    if (!remoteUrl) return '';
    if (remoteUrl.startsWith('file://')) return remoteUrl;

    try {
      await this.ensureDirectory(storeId);
      const localPath = this.getLocalPath(remoteUrl, storeId);
      const fileInfo = await FileSystem.getInfoAsync(localPath);

      if (fileInfo.exists) {
        return localPath;
      }

      // Download from remote URL to local document directory
      await FileSystem.downloadAsync(remoteUrl, localPath);
      return localPath;
    } catch (error) {
      console.warn('Failed to cache image offline, falling back to remote URL:', error);
      return remoteUrl;
    }
  }

  /**
   * Clears all cached images for a specific store.
   */
  static async clearStoreCache(storeId: string): Promise<void> {
    try {
      const dir = `${FileSystem.documentDirectory}caches/store_${storeId}/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
        console.log(`Cleared cached images for store: ${storeId}`);
      }
    } catch (error) {
      console.error(`Failed to clear cached images for store ${storeId}:`, error);
    }
  }
}

export default ImageCacheService;
