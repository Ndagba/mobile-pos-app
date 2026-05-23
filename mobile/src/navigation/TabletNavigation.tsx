import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  SafeAreaView,
  Image,
  useWindowDimensions,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useResponsive, responsiveFontSize, responsiveSpacing } from '../utils/responsiveDesign';

/**
 * Tablet-optimized navigation with side drawer
 * Shows side navigation on tablets, bottom tabs on phones
 */

const Stack = createNativeStackNavigator();

interface TabletNavigationProps {
  screens: Array<{
    name: string;
    component: React.ComponentType<any>;
    label: string;
    icon: string;
  }>;
}

export const TabletNavigationLayout: React.FC<TabletNavigationProps> = ({ screens }) => {
  const { isTablet, isPortrait, deviceType } = useResponsive();
  const { width, height } = useWindowDimensions();
  const [selectedTab, setSelectedTab] = useState(screens[0].name);

  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  if (isTablet && isPortrait) {
    // Tablet portrait: side drawer navigation
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.tabletContainer}>
          {/* Left sidebar */}
          <View
            style={[
              styles.sidebar,
              {
                width: width * 0.25,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.lg,
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {screens.map((screen) => (
                <TouchableOpacity
                  key={screen.name}
                  style={[
                    styles.sidebarItem,
                    {
                      paddingVertical: spacing.lg,
                      paddingHorizontal: spacing.md,
                      marginBottom: spacing.md,
                      backgroundColor:
                        selectedTab === screen.name
                          ? '#dbeafe'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedTab(screen.name)}
                >
                  <Text
                    style={[
                      styles.sidebarItemText,
                      {
                        fontSize: fontSize.base,
                        color:
                          selectedTab === screen.name ? '#2563eb' : '#666',
                      },
                    ]}
                  >
                    {screen.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Right content area */}
          <View style={styles.tabletContent}>
            {screens.find((s) => s.name === selectedTab)?.component &&
              React.createElement(
                screens.find((s) => s.name === selectedTab)!.component
              )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Tablet landscape: side drawer + content
  if (isTablet && !isPortrait) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.tabletContainer}>
          {/* Left sidebar - narrower in landscape */}
          <View
            style={[
              styles.sidebar,
              {
                width: width * 0.2,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {screens.map((screen) => (
                <TouchableOpacity
                  key={screen.name}
                  style={[
                    styles.sidebarItem,
                    {
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.sm,
                      marginBottom: spacing.sm,
                      backgroundColor:
                        selectedTab === screen.name
                          ? '#dbeafe'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedTab(screen.name)}
                >
                  <Text
                    style={[
                      styles.sidebarItemText,
                      {
                        fontSize: fontSize.sm,
                        color:
                          selectedTab === screen.name ? '#2563eb' : '#666',
                      },
                    ]}
                  >
                    {screen.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Right content area - larger in landscape */}
          <View style={[styles.tabletContent, { flex: 1 }]}>
            {screens.find((s) => s.name === selectedTab)?.component &&
              React.createElement(
                screens.find((s) => s.name === selectedTab)!.component
              )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Phone: just show the component
  return (
    <>
      {screens.find((s) => s.name === selectedTab)?.component &&
        React.createElement(
          screens.find((s) => s.name === selectedTab)!.component
        )}
    </>
  );
};

export const SidebarNavigationButton: React.FC<{
  label: string;
  onPress: () => void;
  isActive: boolean;
}> = ({ label, onPress, isActive }) => {
  const { deviceType } = useResponsive();
  const fontSize = responsiveFontSize(deviceType);
  const spacing = responsiveSpacing(deviceType);

  return (
    <TouchableOpacity
      style={[
        styles.sidebarItem,
        {
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.md,
          backgroundColor: isActive ? '#dbeafe' : 'transparent',
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.sidebarItemText,
          {
            fontSize: fontSize.base,
            color: isActive ? '#2563eb' : '#666',
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabletContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    paddingVertical: 16,
  },
  sidebarItem: {
    borderRadius: 8,
  },
  sidebarItemText: {
    fontWeight: '500',
    color: '#666',
  },
  tabletContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});

export default TabletNavigationLayout;
