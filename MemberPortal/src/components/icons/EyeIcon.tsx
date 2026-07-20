import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = { visible?: boolean; size?: number; color?: string };

/** Password-visibility toggle glyph: open eye, or eye with a slash through it. */
export default function EyeIcon({ visible, size = 20, color = '#64748B' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!visible && (
        <Path d="M3 3l18 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}
