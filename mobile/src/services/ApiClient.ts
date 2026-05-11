import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/v1';

interface OfflineRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private offlineQueue: OfflineRequest[] = [];
  private isOnline: boolean = true;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor for auth
    this.axiosInstance.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          const refreshToken = await this.getRefreshToken();
          if (refreshToken) {
            try {
              const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
                refresh_token: refreshToken
              });

              await this.saveTokens(
                response.data.data.access_token,
                response.data.data.refresh_token
              );

              // Retry original request
              const originalRequest = error.config;
              if (originalRequest) {
                originalRequest.headers.Authorization = `Bearer ${response.data.data.access_token}`;
                return this.axiosInstance(originalRequest);
              }
            } catch (refreshError) {
              // Logout user
              await this.clearTokens();
              throw refreshError;
            }
          }
        }

        // Handle offline
        if (!error.response && error.message === 'Network Error') {
          this.isOnline = false;
        }

        throw error;
      }
    );
  }

  async get<T>(url: string, config?: any): Promise<T> {
    try {
      const response = await this.axiosInstance.get(url, config);
      return response.data.data;
    } catch (error) {
      if (!this.isOnline) {
        // Return cached data if available
        const cached = await this.getCachedData(url);
        if (cached) return cached;
      }
      throw error;
    }
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    try {
      const response = await this.axiosInstance.post(url, data, config);
      return response.data.data;
    } catch (error) {
      if (!this.isOnline && error instanceof AxiosError && !error.response) {
        // Queue for later sync
        this.offlineQueue.push({
          method: 'POST',
          url,
          data,
          timestamp: Date.now()
        });

        // Return optimistic response
        return data as T;
      }
      throw error;
    }
  }

  async patch<T>(url: string, data?: any, config?: any): Promise<T> {
    try {
      const response = await this.axiosInstance.patch(url, data, config);
      return response.data.data;
    } catch (error) {
      if (!this.isOnline && error instanceof AxiosError && !error.response) {
        this.offlineQueue.push({
          method: 'PATCH',
          url,
          data,
          timestamp: Date.now()
        });
        return data as T;
      }
      throw error;
    }
  }

  async delete<T>(url: string, config?: any): Promise<T> {
    try {
      const response = await this.axiosInstance.delete(url, config);
      return response.data.data;
    } catch (error) {
      if (!this.isOnline && error instanceof AxiosError && !error.response) {
        this.offlineQueue.push({
          method: 'DELETE',
          url,
          timestamp: Date.now()
        });
      }
      throw error;
    }
  }

  async getOfflineQueue(): Promise<OfflineRequest[]> {
    return this.offlineQueue;
  }

  async clearOfflineQueue() {
    this.offlineQueue = [];
  }

  setOnlineStatus(isOnline: boolean) {
    this.isOnline = isOnline;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return AsyncStorage.getItem('access_token');
      } else {
        return SecureStore.getItemAsync('access_token');
      }
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  private async getRefreshToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return AsyncStorage.getItem('refresh_token');
      } else {
        return SecureStore.getItemAsync('refresh_token');
      }
    } catch (error) {
      console.error('Error getting refresh token:', error);
      return null;
    }
  }

  private async saveTokens(accessToken: string, refreshToken: string) {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.multiSet([
          ['access_token', accessToken],
          ['refresh_token', refreshToken]
        ]);
      } else {
        await Promise.all([
          SecureStore.setItemAsync('access_token', accessToken),
          SecureStore.setItemAsync('refresh_token', refreshToken)
        ]);
      }
    } catch (error) {
      console.error('Error saving tokens:', error);
    }
  }

  private async clearTokens() {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      } else {
        await Promise.all([
          SecureStore.deleteItemAsync('access_token'),
          SecureStore.deleteItemAsync('refresh_token')
        ]);
      }
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  }

  private async getCachedData(url: string): Promise<any | null> {
    try {
      const cached = await AsyncStorage.getItem(`cache_${url}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  async cacheData(url: string, data: any) {
    try {
      await AsyncStorage.setItem(`cache_${url}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error caching data:', error);
    }
  }
}

export default new ApiClient();
