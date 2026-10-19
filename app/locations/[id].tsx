import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, Row, Screen, SectionTitle, StatusBadge } from '../../src/components/ui';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { fmtQty, fullName, getLocation, locationContents, qrValueFor } from '../../src/services/inventory';
import { printLabels, qrText } from '../../src/lib/labels';
import { cmyk, colors, radius, space, type } from '../../src/theme';

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loc] = useFocusQuery(() => getLocation(id), [id]);
  const [{ assets, lots }] = useFocusQuery(() => locationContents(id), [id]);
  if (!loc) return <Screen><Empty text="Location not found." /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: loc.name }} />
      <Card>
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <View style={{ padding: 8, backgroundColor: '#fff', borderRadius: radius.md }}>
            <QRCode value={qrText(loc.name, `Location · ${loc.type}`, loc.code)} size={84} color={cmyk.key} ecl="M" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.title}>{loc.name}</Text>
            <Text style={[type.caption, type.mono]}>{loc.code} · {loc.type}</Text>
            <Text style={[type.caption, { marginTop: 6 }]}>{assets.length} assets · {lots.length} stock lots</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title="Label" icon="print-outline" variant="secondary" compact style={{ flex: 1 }} onPress={() => printLabels([{ code: loc.code, title: loc.name, subtitle: `Location · ${loc.type}` }])} />
          <Button title="Audit here" icon="checkmark-done" compact style={{ flex: 1 }} onPress={() => router.push(`/audit?locationId=${loc.id}`)} />
        </View>
      </Card>

      <SectionTitle>Assets · {assets.length}</SectionTitle>
      <Card padded={false}>
        {assets.length === 0 ? <Empty icon="cube-outline" text="No assets stored here." /> : assets.map((a, i) => (
          <Row key={a.id} icon="cube" iconColor={cmyk.cyan} title={fullName(a)} subtitle={a.code} right={<StatusBadge status={a.status} />} onPress={() => router.push(`/asset/${a.id}`)} last={i === assets.length - 1} />
        ))}
      </Card>
      <SectionTitle>Stock · {lots.length}</SectionTitle>
      <Card padded={false}>
        {lots.length === 0 ? <Empty icon="layers-outline" text="No stock stored here." /> : lots.map((l, i) => (
          <Row
            key={l.id}
            icon="layers"
            iconColor={cmyk.magenta}
            title={fullName(l)}
            subtitle={l.code}
            right={<Text style={{ fontWeight: '800', color: colors.text }}>{fmtQty(l.quantity)} <Text style={type.caption}>{l.unit}</Text></Text>}
            onPress={() => router.push(`/lot/${l.id}`)}
            last={i === lots.length - 1}
          />
        ))}
      </Card>
    </Screen>
  );
}
