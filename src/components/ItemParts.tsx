import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Empty, IconName, Row, SectionTitle } from './ui';
import { describeMovement, MOVEMENT_ICON, syncLabel, timeAgo } from '../services/format';
import { identifiersFor, qrValueFor, type MovementView } from '../services/inventory';
import { printLabels, qrText, shareLabelsPdf } from '../lib/labels';
import type { EntityType } from '../domain/types';
import { cmyk, colors, radius, space, type } from '../theme';

const ID_ICON: Record<string, { icon: IconName; color: string }> = {
  qr: { icon: 'qr-code', color: cmyk.cyan },
  barcode: { icon: 'barcode', color: cmyk.yellow },
  rfid: { icon: 'radio', color: cmyk.magenta },
  nfc: { icon: 'wifi', color: colors.success },
};

/** QR preview + all identifiers (QR, barcode, later RFID/NFC) linked to one record. */
export function IdentityCard({ entityType, id, code, title, subtitle }: { entityType: EntityType; id: string; code: string; title: string; subtitle?: string | null }) {
  const identifiers = identifiersFor(entityType, id);
  const label = { code, title, subtitle, qrValue: qrValueFor(code) };
  return (
    <>
      <SectionTitle>Identity</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <View style={styles.qr}>
            <QRCode value={qrText(title, subtitle, code)} size={92} color={cmyk.key} backgroundColor="#fff" ecl="M" />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {identifiers.map((i) => (
              <View key={i.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={ID_ICON[i.type].icon} size={16} color={ID_ICON[i.type].color} />
                <Text style={[type.caption, type.mono, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>{i.value}</Text>
              </View>
            ))}
            <Text style={[type.caption, { fontSize: 11, color: colors.textFaint }]}>RFID / NFC can be linked to this same record later.</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title="Print" icon="print-outline" variant="secondary" compact onPress={() => printLabels([label])} style={{ flex: 1 }} />
          <Button title="PDF" icon="share-outline" variant="secondary" compact onPress={() => shareLabelsPdf([label])} style={{ flex: 1 }} />
          <Button title="Link" icon="link-outline" variant="secondary" compact onPress={() => router.push(`/scan?mode=link&entityType=${entityType}&id=${id}`)} style={{ flex: 1 }} />
        </View>
      </Card>
    </>
  );
}

export function HistoryList({ items }: { items: MovementView[] }) {
  return (
    <>
      <SectionTitle>History · {items.length}</SectionTitle>
      <Card padded={false}>
        {items.length === 0 ? (
          <Empty icon="time-outline" text="No movements yet." />
        ) : (
          items.map((m, i) => (
            <Row
              key={m.id}
              icon={MOVEMENT_ICON[m.type]?.icon}
              iconColor={MOVEMENT_ICON[m.type]?.color}
              title={describeMovement(m)}
              subtitle={`${m.staff} · ${timeAgo(m.created_at)} ${syncLabel(m.sync_state)}${m.notes ? `\n${m.notes}` : ''}`}
              last={i === items.length - 1}
            />
          ))
        )}
      </Card>
    </>
  );
}

export function InfoLine({ label, value, icon }: { label: string; value?: string | null; icon?: IconName }) {
  if (!value) return null;
  return (
    <View style={styles.info}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Ionicons name={icon} size={15} color={colors.textMuted} /> : null}
        <Text style={type.caption}>{label}</Text>
      </View>
      <Text style={{ fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right', fontSize: 14 }}>{value}</Text>
    </View>
  );
}

/** Square glass action tile used on detail screens. */
export function ActionTile({ icon, label, color, onPress, disabled }: { icon: IconName; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Card onPress={disabled ? undefined : onPress} style={{ flex: 1, opacity: disabled ? 0.35 : 1, marginBottom: 0 }} padded={false}>
      <View style={{ alignItems: 'center', paddingVertical: space.lg, gap: 8 }}>
        <View style={[styles.tileIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={22} color={color === cmyk.yellow ? cmyk.key : '#fff'} />
        </View>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  qr: { padding: 8, backgroundColor: '#fff', borderRadius: radius.md },
  info: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tileIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
