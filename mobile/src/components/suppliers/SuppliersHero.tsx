import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../../theme';

interface HeroStats {
  totalCount: number;
  preferredCount: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
}

interface SuppliersHeroProps {
  stats: HeroStats;
}

// Compact currency formatter — "₦450K", "₦1.2M", or "₦500"
function compactNaira(v: number): string {
  if (!isFinite(v) || v <= 0) return '₦0';
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${Math.round(v / 1000)}K`;
  return `₦${Math.round(v)}`;
}

export default function SuppliersHero({ stats }: SuppliersHeroProps) {
  const invoicedStr = compactNaira(stats.totalInvoiced);
  const paidStr = compactNaira(stats.totalPaid);
  const outstandingStr = compactNaira(stats.outstanding);

  return (
    <LinearGradient
      colors={['#7C3AED', '#4F46E5']}
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
          backgroundColor: 'rgba(255,255,255,0.08)',
          top: -30,
          right: -30,
        }}
      />

      <View style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <Text style={styles.eyebrow}>ALL SUPPLIERS</Text>

        {/* Big count */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <Text style={styles.bigCount}>{stats.totalCount}</Text>
          <Text style={styles.contactsLabel}>suppliers</Text>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Invoiced */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>INVOICED</Text>
            <Text style={styles.statValue}>{invoicedStr}</Text>
          </View>

          <View style={styles.divider} />

          {/* Paid */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>PAID</Text>
            <Text style={styles.statValue}>{paidStr}</Text>
          </View>

          <View style={styles.divider} />

          {/* Outstanding */}
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>OWING</Text>
            <Text style={styles.statValue}>{outstandingStr}</Text>
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
