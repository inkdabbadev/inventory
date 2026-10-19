import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scanner } from '../src/components/Scanner';
import { Button, Field, Glass } from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { InventoryError, linkIdentifier, resolveScan } from '../src/services/inventory';
import type { EntityType } from '../src/domain/types';
import { cmyk, radius, space, type } from '../src/theme';

/**
 * Single-scan screen.
 *  - default: look up whatever is scanned and open it
 *  - mode=link&entityType=&id=: attach a manufacturer barcode / extra code to an existing record
 */
export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode?: string; entityType?: EntityType; id?: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState('');
  const linking = params.mode === 'link' && params.entityType && params.id;

  const handle = (value: string) => {
    if (!value.trim()) return;
    setPaused(true);

    if (linking) {
      try {
        linkIdentifier(params.entityType!, params.id!, value.startsWith('INK:') ? 'qr' : 'barcode', value);
        toast('Code linked to this record');
        router.back();
      } catch (e) {
        toast(e instanceof InventoryError ? e.message : String(e), 'error');
        setTimeout(() => setPaused(false), 800);
      }
      return;
    }

    const result = resolveScan(value);
    switch (result.kind) {
      case 'asset':
        router.replace(`/asset/${result.item.id}`);
        break;
      case 'lot':
        router.replace(`/lot/${result.item.id}`);
        break;
      case 'location':
        router.replace(`/locations/${result.item.id}`);
        break;
      default:
        Alert.alert('Not in inventory', `No item is linked to:\n${result.value}`, [
          { text: 'Scan again', style: 'cancel', onPress: () => setPaused(false) },
          { text: 'Add as new item', onPress: () => router.replace(`/add?barcode=${encodeURIComponent(result.value)}`) },
        ]);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: cmyk.key }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: linking ? 'Link code' : 'Scan', headerTransparent: true }} />
      <Scanner onScan={handle} paused={paused} hint={linking ? 'Scan the barcode to link' : undefined} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <Glass radius={radius.xl} intensity={50} tint="rgba(10,10,18,0.5)">
          <View style={{ padding: space.lg }}>
            <View style={styles.grabber} />
            <Text style={[type.headline, { marginBottom: space.md }]}>{linking ? 'Link a barcode' : 'Or enter a code'}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Field label="" icon="keypad-outline" placeholder="CBL-HDM-0042 or barcode" value={manual} onChangeText={setManual} autoCapitalize="characters" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => handle(normalise(manual))} />
              </View>
              <Button title="Find" icon="search" onPress={() => handle(normalise(manual))} disabled={!manual.trim()} />
            </View>
          </View>
        </Glass>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Typed asset codes like CBL-0042 map to the app's QR value; anything else is treated as a raw barcode. */
function normalise(v: string) {
  const t = v.trim();
  return /^[A-Z0-9]{1,5}(-[A-Z0-9]{1,5})?-\d{4,}$/i.test(t) ? `INK:${t.toUpperCase()}` : t;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: space.md, right: space.md, bottom: 0 },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: space.md },
});
