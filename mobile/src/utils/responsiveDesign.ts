import { useWindowDimensions } from 'react-native';

/**
 * Responsive design utilities for phone and tablet layouts
 */

export const BREAKPOINTS = {
  phone: 0,
  tablet: 600, // 600dp+ is typically tablet
  large_tablet: 900, // 900dp+ is large tablet
} as const;

export type DeviceType = 'phone' | 'tablet' | 'large_tablet';

export interface ResponsiveValues<T> {
  phone: T;
  tablet?: T;
  large_tablet?: T;
}

/**
 * Hook to get device type and responsive values
 */
export const useResponsive = () => {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= BREAKPOINTS.tablet;
  const isLargeTablet = width >= BREAKPOINTS.large_tablet;
  const isPortrait = height > width;
  const isLandscape = width > height;

  const getValue = <T,>(values: ResponsiveValues<T>): T => {
    if (isLargeTablet && values.large_tablet !== undefined) return values.large_tablet;
    if (isTablet && values.tablet !== undefined) return values.tablet;
    return values.phone;
  };

  // Narrow the return type to the union so downstream consumers
  // (responsiveSpacing, responsiveFontSize, etc.) accept it without casts.
  const deviceType: DeviceType = isLargeTablet
    ? 'large_tablet'
    : isTablet
      ? 'tablet'
      : 'phone';

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isPortrait,
    isLandscape,
    getValue,
    deviceType,
  };
};

/**
 * Responsive spacing values
 */
export const responsiveSpacing = (deviceType: DeviceType) => {
  const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  };

  if (deviceType === 'large_tablet') {
    return {
      xs: 6,
      sm: 12,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 40,
    };
  }

  if (deviceType === 'tablet') {
    return {
      xs: 5,
      sm: 10,
      md: 14,
      lg: 20,
      xl: 28,
      xxl: 32,
    };
  }

  return spacing;
};

/**
 * Responsive font sizes
 */
export const responsiveFontSize = (deviceType: DeviceType) => {
  const sizes = {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
  };

  if (deviceType === 'large_tablet') {
    return {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 20,
      xl: 24,
      xxl: 28,
      xxxl: 32,
    };
  }

  if (deviceType === 'tablet') {
    return {
      xs: 11,
      sm: 13,
      base: 15,
      lg: 18,
      xl: 21,
      xxl: 24,
      xxxl: 28,
    };
  }

  return sizes;
};

/**
 * Responsive button sizing
 */
export const responsiveButtonSize = (deviceType: DeviceType) => {
  const sizes = {
    small: { paddingVertical: 8, paddingHorizontal: 12 },
    medium: { paddingVertical: 12, paddingHorizontal: 16 },
    large: { paddingVertical: 16, paddingHorizontal: 20 },
  };

  if (deviceType === 'large_tablet') {
    return {
      small: { paddingVertical: 12, paddingHorizontal: 18 },
      medium: { paddingVertical: 18, paddingHorizontal: 28 },
      large: { paddingVertical: 24, paddingHorizontal: 36 },
    };
  }

  if (deviceType === 'tablet') {
    return {
      small: { paddingVertical: 10, paddingHorizontal: 15 },
      medium: { paddingVertical: 14, paddingHorizontal: 22 },
      large: { paddingVertical: 20, paddingHorizontal: 28 },
    };
  }

  return sizes;
};

/**
 * Responsive touch target size (minimum 48dp for accessibility)
 */
export const responsiveMinTouchTarget = (deviceType: DeviceType) => {
  if (deviceType === 'large_tablet') return 64;
  if (deviceType === 'tablet') return 56;
  return 48;
};

/**
 * Grid column count based on device
 */
export const responsiveGridColumns = (deviceType: DeviceType) => {
  if (deviceType === 'large_tablet') return 4;
  if (deviceType === 'tablet') return 3;
  return 2;
};

/**
 * Master-detail layout: should show split view?
 */
export const shouldShowMasterDetail = (deviceType: DeviceType) => {
  return deviceType !== 'phone';
};
