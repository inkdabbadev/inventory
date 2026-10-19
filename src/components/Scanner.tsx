import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Button, Glass, IconBubble, IconButton } from './ui';
import { cmyk, colors, radius, space, type } from '../theme';

/** QR plus the common product barcode formats, so one scanner handles labels and manufacturer codes. */
const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'datamatrix'];

/** Same value is ignored for this long, like the cooldown map in the Flutter HomePage. */
const COOLDOWN_MS = 2000;
const FRAME = 236;

/**
 * Camera scanner. Kept behind this one component so Bluetooth HID scanners or
 * RFID readers can later feed the same `onScan` callback.
 */
export function Scanner({ onScan, paused, hint, compact }: { onScan: (value: string) => void; paused?: boolean; hint?: string; compact?: boolean }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const lastScans = useRef(new Map<string, number>());
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const frame = compact ? 140 : FRAME;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const flash = () => {
    pulse.setValue(1);
    Animated.timing(pulse, { toValue: 0, duration: 450, useNativeDriver: true }).start();
  };

  if (!permission) return <View style={styles.box} />;
  if (!permission.granted) {
    return (
      <View style={[styles.box, styles.center]}>
        <IconBubble icon="camera" color={cmyk.cyan} size={64} />
        <Text style={[type.headline, { marginTop: space.lg, textAlign: 'center' }]}>Camera access needed</Text>
        <Text style={[type.caption, { textAlign: 'center', marginTop: 6, maxWidth: 280 }]}>Used only to read QR codes and barcodes on items and shelves.</Text>
        <Button title="Allow camera" icon="camera-outline" onPress={requestPermission} style={{ marginTop: space.xl, minWidth: 200 }} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                if (!data) return;
                const t = Date.now();
                const last = lastScans.current.get(data);
                if (last && t - last < COOLDOWN_MS) return;
                lastScans.current.set(data, t);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                flash();
                onScan(data);
              }
        }
      />
      {/* dim outside the frame */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(7,7,12,0.35)' }]}>
        <View style={{ width: frame, height: frame }}>
          <Corner pos="tl" color={cmyk.cyan} />
          <Corner pos="tr" color={cmyk.magenta} />
          <Corner pos="bl" color={cmyk.yellow} />
          <Corner pos="br" color="#FFFFFF" />
          {!paused ? (
            <Animated.View style={{ position: 'absolute', left: 12, right: 12, transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [10, frame - 14] }) }] }}>
              <LinearGradient colors={['transparent', cmyk.cyan, cmyk.magenta, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 3, borderRadius: 2 }} />
            </Animated.View>
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 24, backgroundColor: 'rgba(46,230,166,0.25)', opacity: pulse }]} />
        </View>
        <Glass radius={radius.pill} intensity={40} style={{ marginTop: compact ? space.sm : space.xl }}>
          <Text style={styles.hint}>{paused ? 'Paused' : hint ?? 'Point at a QR code or barcode'}</Text>
        </Glass>
      </View>
      <View style={styles.torch}>
        <IconButton icon={torch ? 'flashlight' : 'flashlight-outline'} color={torch ? cmyk.yellow : colors.text} onPress={() => setTorch((t) => !t)} />
      </View>
    </View>
  );
}

function Corner({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const s = 34;
  const w = 4;
  const base = { position: 'absolute' as const, width: s, height: s, borderColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 8 };
  const map = {
    tl: { top: 0, left: 0, borderTopWidth: w, borderLeftWidth: w, borderTopLeftRadius: 22 },
    tr: { top: 0, right: 0, borderTopWidth: w, borderRightWidth: w, borderTopRightRadius: 22 },
    bl: { bottom: 0, left: 0, borderBottomWidth: w, borderLeftWidth: w, borderBottomLeftRadius: 22 },
    br: { bottom: 0, right: 0, borderBottomWidth: w, borderRightWidth: w, borderBottomRightRadius: 22 },
  };
  return <View style={[base, map[pos]]} />;
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: cmyk.key, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.md },
  hint: { color: colors.text, fontSize: 14, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 9 },
  torch: { position: 'absolute', bottom: 16, right: 16 },
});
