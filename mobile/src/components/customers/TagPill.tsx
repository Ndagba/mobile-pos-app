import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../theme';

interface TagPillProps {
  /** Free-text customer tag. Desktop writes regular / vip / wholesale; older mobile builds wrote VIP / New. */
  kind: string;
}

const TONES: Record<string, { label: string; bg: string; fg: string }> = {
  vip: { label: 'VIP', bg: 'rgba(245,158,11,0.16)', fg: '#B45309' },
  wholesale: { label: 'Wholesale', bg: C.violetBg, fg: C.accent },
  new: { label: 'New', bg: 'rgba(16,185,129,0.14)', fg: '#0F8A5B' },
};

export default function TagPill({ kind }: TagPillProps) {
  const tone = TONES[(kind ?? '').toLowerCase()];
  // "regular" (and anything unknown) is the default customer — no pill.
  if (!tone) return null;

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  text: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.06,
  },
});
