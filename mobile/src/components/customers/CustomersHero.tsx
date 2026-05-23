import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../../theme';

interface HeroStats {
  totalCount: number;
  vipCount: number;
  active30dCount: number;
  lifetimeSpend: number;
  outstandingTotal: number;
}

interface CustomersHeroProps {
  stats: HeroStats;
}

// Compact currency formatter — "₦450K", "₦1.2M", or "₦500"
function compactNaira(v: number): string {
  if (!isFinite(v) || v <= 0) return '₦0';
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${Math.round(v / 1000)}K`;
  return `₦${Math.round(v)}`;
}

export default function CustomersHero({ stats }: CustomersHeroProps) {
  const lifetime = compactNaira(stats.lifetimeSpend);
  const outstanding = compactNaira(stats.outstandingTotal);

  return (
    <LinearGradient
      colors={[C.accent, C.accent2]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Decorative circle */}
      <View
        style={{
          position: 'absolute',
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: 'rgba(255,255,255,0.1)',
          top: -30,
          right: -30,
        }}
      />

      <View style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <Text style={styles.eyebrow}>ALL CUSTOMERS</Text>

        {/* Big count */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <Text style={styles.bigCount}>{stats.totalCount}</Text>
          <Text style={styles.contactsLabel}>contacts</Text>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* VIP */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>VIP</Text>
            <Text style={styles.statValue}>{stats.vipCount}</Text>
          </View>

          <View style={styles.divider} />

          {/* Active 30d */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>ACTIVE 30D</Text>
            <Text style={styles.statValue}>{stats.active30dCount}</Text>
          </View>

          <View style={styles.divider} />

          {/* Lifetime */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>LIFETIME</Text>
            <Text style={styles.statValue}>{lifetime}</Text>
          </View>

          <View style={styles.divider} />

          {/* Outstanding */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>OUTSTANDING</Text>
            <Text style={styles.statValue}>{outstanding}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bigCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.02,
    fontFamily: 'JetBrains Mono',
  },
  contactsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.08,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'JetBrains Mono',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
