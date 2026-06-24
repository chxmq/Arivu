import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Colors } from '@/constants/colors';

export default function SentinelIllustration() {
  return (
    <Svg width={100} height={140} viewBox="0 0 100 140">
      <Rect x={20} y={30} width={60} height={95} rx={8} fill={Colors.headerDark} />
      <Rect x={28} y={18} width={44} height={14} rx={3} fill={Colors.teachGreen} />
      <Path d="M50 42 L44 52 L56 52 Z" fill={Colors.teachGreen} />
      {Array.from({ length: 4 }).map((_, row) =>
        Array.from({ length: 4 }).map((__, col) => (
          <Circle
            key={`${row}-${col}`}
            cx={32 + col * 12}
            cy={58 + row * 10}
            r={2.5}
            fill={Colors.teachGreen}
            opacity={0.7}
          />
        ))
      )}
      <Circle cx={50} cy={115} r={8} fill={Colors.askGold} />
    </Svg>
  );
}
