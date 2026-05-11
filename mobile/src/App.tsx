import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider } from 'react-redux';
import { ActivityIndicator, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

import { store } from './redux/store';
import DatabaseService from './services/DatabaseService';
import ApiClient from './services/ApiClient';

// Screens
import AuthScreen from './screens/AuthScreen';
import DashboardScreen from './screens/DashboardScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import InventoryScreen from './screens/InventoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      // Initialize database
      await DatabaseService.initialize();

      // Check if user is authenticated
      const token = await SecureStore.getItemAsync('access_token');
      setIsSignedIn(!!token);

      // Set up network monitoring
      NetInfo.addEventListener((state) => {
        ApiClient.setOnlineStatus(state.isConnected ?? false);
      });
    } catch (error) {
      console.error('Bootstrap error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Provider store={store}>
      <PaperProvider>
        <NavigationContainer>
          {isSignedIn ? (
            <Tab.Navigator
              screenOptions={{
                headerShown: true,
                tabBarActiveTintColor: '#6750A4',
                tabBarInactiveTintColor: '#49454E'
              }}
            >
              <Tab.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                  tabBarLabel: 'Dashboard',
                  tabBarIcon: ({ color, size }) => (
                    <View style={{ width: size, height: size, backgroundColor: color }} />
                  )
                }}
              />
              <Tab.Screen
                name="Checkout"
                component={CheckoutScreen}
                options={{
                  tabBarLabel: 'Checkout',
                  tabBarIcon: ({ color, size }) => (
                    <View style={{ width: size, height: size, backgroundColor: color }} />
                  )
                }}
              />
              <Tab.Screen
                name="Inventory"
                component={InventoryScreen}
                options={{
                  tabBarLabel: 'Inventory',
                  tabBarIcon: ({ color, size }) => (
                    <View style={{ width: size, height: size, backgroundColor: color }} />
                  )
                }}
              />
              <Tab.Screen
                name="Analytics"
                component={AnalyticsScreen}
                options={{
                  tabBarLabel: 'Analytics',
                  tabBarIcon: ({ color, size }) => (
                    <View style={{ width: size, height: size, backgroundColor: color }} />
                  )
                }}
              />
              <Tab.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                  tabBarLabel: 'Settings',
                  tabBarIcon: ({ color, size }) => (
                    <View style={{ width: size, height: size, backgroundColor: color }} />
                  )
                }}
              />
            </Tab.Navigator>
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Auth" component={AuthScreen} />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </PaperProvider>
    </Provider>
  );
}
