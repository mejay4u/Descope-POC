import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = { size?: number };

export default function WhatsAppIcon({ size = 18 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill="#25D366" />
      <Path
        d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.9A6.5 6.5 0 1 0 12 5.5z"
        fill="#FFFFFF"
      />
      <Path
        d="M9.7 9.1c.2-.4.3-.4.5-.4h.4c.1 0 .3 0 .5.4l.5 1.2c.1.1.1.3 0 .4l-.3.4c-.1.1-.1.2 0 .4.2.4.6.9 1 1.3.4.4.9.7 1.3 1 .1.1.3.1.4 0l.4-.3c.1-.1.3-.1.4 0l1.2.5c.4.2.4.4.4.5v.4c0 .3-.4.7-.7.8-.4.2-.8.2-1.3.1a6 6 0 0 1-2.6-1.5 6 6 0 0 1-1.5-2.6c-.1-.5-.1-.9.1-1.3.1-.3.5-.7.8-.7z"
        fill="#25D366"
      />
    </Svg>
  );
}
