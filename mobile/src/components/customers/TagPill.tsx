import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../theme';

interface TagPillProps {
  kind: 'VIP' | 'New';
}

export default function TagPill({ kind }: TagPillProps) {
  const isVIP = kind === 'VIP';
  const bgColor = isVIP ? 'rgba(245,158,11,0.16)' : 'rgba(16,185,129,0.14)';
  const textColor = isVIP ? '#B45309' : '#0F8A5B';

  return (
    <View style={[styles.pill, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{kind}</Text>
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
