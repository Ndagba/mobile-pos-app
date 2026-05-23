import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';
import { C } from '../../theme';

interface Chip {
  key: 'all' | 'vip' | 'new';
  label: string;
  count: number;
}

interface FilterChipGroupProps {
  chips: Chip[];
  active: string;
  onSelect: (key: string) => void;
}

export default function FilterChipGroup({ chips, active, onSelect }: FilterChipGroupProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {chips.map(chip => {
          const isActive = active === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              onPress={() => onSelect(chip.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? C.accent : C.card,
                  borderColor: isActive ? C.accent : C.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: isActive ? C.accentFg : C.ink },
                ]}
              >
                {chip.label}
              </Text>
              <Text
                style={[
                  styles.chipCount,
                  { color: isActive ? C.accentFg : C.muted },
                ]}
              >
                {chip.count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipCount: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'JetBrains Mono',
  },
});
