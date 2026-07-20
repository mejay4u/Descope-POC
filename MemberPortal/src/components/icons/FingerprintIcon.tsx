import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = { size?: number; color?: string };

export default function FingerprintIcon({ size = 18, color = '#0F2A5C' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 11c1.1 0 2 .9 2 2v2a6 6 0 0 1-1 3.3"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 11a4 4 0 0 1 8 0v2a8 8 0 0 1-1.5 4.7"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 11a7 7 0 0 1 13.6-2.3"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 14a7 7 0 0 0 3.3 5.9"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 9.5A9 9 0 0 1 16.4 4.2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 11v3a10 10 0 0 0 1.5 5.2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
