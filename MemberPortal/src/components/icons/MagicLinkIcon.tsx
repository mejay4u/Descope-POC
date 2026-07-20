import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = { size?: number; color?: string };

/** A pair of sparkles standing in for "magic" link sign-in. */
export default function MagicLinkIcon({ size = 18, color = '#0F2A5C' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 2l1.4 4.1L16.5 7.5l-4.1 1.4L11 13l-1.4-4.1L5.5 7.5l4.1-1.4L11 2z"
        fill={color}
      />
      <Path
        d="M18 13l.8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13z"
        fill={color}
      />
    </Svg>
  );
}
