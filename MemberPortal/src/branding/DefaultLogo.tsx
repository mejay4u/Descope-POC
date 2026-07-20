import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = { size?: number };

/** The default Member Portal mark — swappable via BrandingProvider. */
export default function DefaultLogo({ size = 88 }: Props) {
  return (
    <View
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: size * 0.27 },
      ]}>
      <Text style={[styles.mark, { fontSize: size * 0.5 }]}>M</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  mark: { color: colors.white, fontWeight: '800' },
});
