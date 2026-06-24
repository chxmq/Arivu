import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';

type ActionCardProps = {
  backgroundColor: string;
  accentColor?: string;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onPress: () => void;
};

export default function ActionCard({
  backgroundColor,
  accentColor,
  icon,
  label,
  subtitle,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor,
          borderTopColor: accentColor ?? backgroundColor,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.iconCircle}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 80,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 6,
    borderTopColor: 'transparent',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.textOnDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  textBlock: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    color: Colors.textOnDark,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textOnDark,
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  chevron: {
    color: Colors.textOnDark,
    fontSize: 24,
    marginRight: 16,
  },
});
