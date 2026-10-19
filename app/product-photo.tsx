import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, Screen } from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { useFocusQuery } from '../src/hooks/useRefresh';
import { uploadProductImage } from '../src/lib/neon';
import { ProductImage } from '../src/components/ProductImage';
import { getProduct, setProductImage } from '../src/services/inventory';
import { colors, space, type } from '../src/theme';

export default function ProductPhotoScreen() {
  const { productId = '' } = useLocalSearchParams<{ productId: string }>();
  const [product, reload] = useFocusQuery(() => getProduct(productId), [productId]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const store = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const photo = result.assets[0];
    if (!photo.base64) return toast('Could not read that image. Please choose another.', 'error');
    setSaving(true);
    try {
      // ImagePicker documents its base64 result as JPEG data (including converted HEIC photos).
      const key = await uploadProductImage(photo.base64, 'image/jpeg');
      setProductImage(productId, key);
      reload();
      toast('Product image saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const gallery = async () => store(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7, base64: true }));
  const camera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to take a product photo.');
    return store(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7, base64: true }));
  };

  if (!product) return <Screen><Empty text="Product not found." /></Screen>;
  const hasImage = Boolean(product.image_key);

  return (
    <Screen>
      <Stack.Screen options={{ title: product.name }} />
      <Card>
        {product.image_key ? (
          <ProductImage imageKey={product.image_key} style={styles.photo} />
        ) : (
          <View style={styles.placeholder}><Text style={type.caption}>No product image</Text></View>
        )}
        <View style={styles.actions}>
          <Button title="Camera" icon="camera-outline" variant="secondary" onPress={camera} loading={saving} style={{ flex: 1 }} />
          <Button title="Gallery" icon="images-outline" variant="secondary" onPress={gallery} disabled={saving} style={{ flex: 1 }} />
        </View>
        {hasImage ? <Button title="Remove image" icon="trash-outline" variant="danger" onPress={() => { setProductImage(productId, null); reload(); toast('Product image removed'); }} disabled={saving} /> : null}
      </Card>
      <Button title="Done" icon="checkmark" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.surfaceStrong },
  placeholder: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.sm, marginVertical: space.sm },
});
