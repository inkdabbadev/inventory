import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, type ImageStyle, StyleSheet, View, type StyleProp } from 'react-native';
import { productImageDataUri } from '../lib/neon';
import { colors } from '../theme';

/** Fetches private image bytes through the authenticated API for reliable native rendering. */
export function ProductImage({ imageKey, style }: { imageKey: string; style?: StyleProp<ImageStyle> }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    productImageDataUri(imageKey).then((value) => active && setUrl(value)).catch(() => {});
    return () => { active = false; };
  }, [imageKey]);

  if (!url) return <View style={[styles.loading, style]}><ActivityIndicator color={colors.primary} /></View>;
  return <Image source={{ uri: url }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
});
