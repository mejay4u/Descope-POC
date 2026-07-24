import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = { size?: number; color?: string };

/** A passkey / security-key glyph (key), matching the stroke style of the other icons. */
export default function KeyIcon({ size = 18, color = '#0F2A5C' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={8} r={4.5} stroke={color} strokeWidth={1.6} />
      <Path
        d="M11.2 11.2 20 20"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m17 17 2-2M14.5 14.5l1.5 1.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
