import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R } from '../../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_META: Record<string, { icon: IconName; label: string }> = {
  Dashboard: { icon: 'view-dashboard',          label: 'Home'      },
  Inventory: { icon: 'package-variant',         label: 'Inventory' },
  Customers: { icon: 'account-multiple',       label: 'Customers' },
  Analytics: { icon: 'chart-bar',               label: 'Analytics' },
  Settings:  { icon: 'cog',                     label: 'Settings'  },
};

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const handleNewSale = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('Checkout' as never);
    }
  };

  const visibleRoutes = state.routes.filter(r => TAB_META[r.name]);

  // 5 tabs split as: 2 left / FAB / 3 right
  const fabIndex = 2;
  const left = visibleRoutes.slice(0, fabIndex);
  const right = visibleRoutes.slice(fabIndex);

  const renderTab = (route: typeof visibleRoutes[0]) => {
    const meta = TAB_META[route.name];
    if (!meta) return null;

    const idx = state.routes.indexOf(route);
    const active = state.index === idx;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!active && !event.defaultPrevented) navigation.navigate(route.name as never);
    };

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        style={[
          styles.tab,
          {
            flex: active ? 2.6 : 1,
            paddingHorizontal: active ? 12 : 4,
            paddingVertical: 9,
            backgroundColor: active ? 'rgba(110,86,247,0.10)' : 'transparent',
            borderRadius: 18,
          },
        ]}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={meta.icon}
          size={active ? 20 : 22}
          color={active ? C.accent : C.muted}
          style={{ strokeWidth: active ? 2.2 : 1.8 }}
        />
        {active && (
          <Text
            style={[styles.tabLabel, { color: C.accent }]}
            numberOfLines={1}
          >
            {meta.label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 28 },
      ]}
    >
      <View style={styles.pill}>
        {/* Left 2 tabs */}
        <View style={{ flexDirection: 'row', gap: 2, flex: 1, minWidth: 0 }}>
          {left.map(renderTab)}
        </View>

        {/* Center FAB slot */}
        <View style={styles.fabSlot}>
          <TouchableOpacity
            onPress={handleNewSale}
            activeOpacity={0.85}
            style={styles.fab}
          >
            <LinearGradient
              colors={[C.accent, C.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons
              name="cart-outline"
              size={22}
              color={C.accentFg}
              style={{ strokeWidth: 2.2 }}
            />
          </TouchableOpacity>
          <Text style={styles.fabLabel}>NEW SALE</Text>
        </View>

        {/* Right 3 tabs */}
        <View style={{ flexDirection: 'row', gap: 2, flex: 1, minWidth: 0 }}>
          {right.map(renderTab)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 20,
    zIndex: 30,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    ...Platform.select({
      ios: {
        shadowColor: C.ink,
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.18,
        shadowRadius: 50,
      },
      android: { elevation: 14 },
    }),
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.01,
  },
  fabSlot: {
    width: 64,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -14 }],
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
      },
      android: { elevation: 14 },
    }),
  },
  fabLabel: {
    marginTop: -14,
    fontSize: 9,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: 0.06,
  },
});
