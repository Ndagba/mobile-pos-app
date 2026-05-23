import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useDispatch } from 'react-redux';
import { setConnected } from '../redux/slices/syncSlice';
import ApiClient from '../services/ApiClient';

export function useNetworkStatus() {
  const dispatch = useDispatch();
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      
      // Update Redux
      dispatch(setConnected(connected));
      
      // Update API client
      ApiClient.setOnlineStatus(connected);
    });

    return () => unsubscribe();
  }, [dispatch]);

  return isConnected;
}
