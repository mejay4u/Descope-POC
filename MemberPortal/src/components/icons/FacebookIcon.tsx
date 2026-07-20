import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = { size?: number };

export default function FacebookIcon({ size = 18 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill="#1877F2" />
      <Path
        d="M13.5 21v-7.2h2.4l.4-2.8h-2.8v-1.8c0-.8.2-1.3 1.4-1.3h1.5V5.3c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.6v2h-2.4v2.8h2.4V21h3z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}
