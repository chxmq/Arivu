import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { ConsentLevel } from '@/types';

type ConsentSelectorProps = {
  value: ConsentLevel;
  onChange: (level: ConsentLevel) => void;
};

const OPTIONS: { key: ConsentLevel; label: string; color: string }[] = [
  { key: 'OPEN', label: 'OPEN', color: Colors.teachGreen },
  { key: 'COMMUNITY_ONLY', label: 'COMMUNITY', color: Colors.askGold },
  { key: 'EMBARGOED', label: 'EMBARGOED', color: Colors.reviewRed },
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
                : { backgroundColor: Colors.textOnDark, borderColor: Colors.borderGrey },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                selected ? styles.selectedText : styles.unselectedText,
              ]}
            >
              {opt.label}
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
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  selectedText: {
    color: Colors.textOnDark,
  },
  unselectedText: {
    color: Colors.textOnLight,
  },
});
