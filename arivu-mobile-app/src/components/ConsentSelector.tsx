import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { ConsentLevel } from '@/types';

type ConsentSelectorProps = {
  value: ConsentLevel;
  onChange: (level: ConsentLevel) => void;
};

const OPTIONS: { key: ConsentLevel; label: string; sublabel: string; icon: string; color: string }[] = [
  { key: 'OPEN', label: 'OPEN', sublabel: 'Anyone may access', icon: '🌍', color: Colors.teachGreen },
  { key: 'COMMUNITY_ONLY', label: 'COMMUNITY', sublabel: 'BMC & ZSI only', icon: '👥', color: Colors.askGold },
  { key: 'EMBARGOED', label: 'EMBARGOED', sublabel: 'Elder approval', icon: '🔒', color: Colors.reviewRed },
];

export default function ConsentSelector({
  value,
  onChange,
}: ConsentSelectorProps) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const selected = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: opt.color, borderColor: opt.color }
                : { backgroundColor: Colors.textOnDark, borderColor: opt.color },
            ]}
          >
            <Text style={styles.icon}>{opt.icon}</Text>
            <Text
              style={[
                styles.chipText,
                selected ? styles.selectedText : { color: opt.color },
              ]}
            >
              {opt.label}
            </Text>
            <Text
              style={[
                styles.chipSub,
                selected ? styles.selectedSub : styles.unselectedSub,
              ]}
            >
              {opt.sublabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chipSub: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  selectedText: {
    color: Colors.textOnDark,
  },
  selectedSub: {
    color: Colors.textOnDark,
    opacity: 0.9,
  },
  unselectedSub: {
    color: Colors.grey,
  },
});
