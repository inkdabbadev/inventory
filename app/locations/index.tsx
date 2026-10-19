import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Button, Card, Chips, Empty, Field, IconButton, IconName, Row, Screen, SectionTitle } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { createLocation, InventoryError, listLocations, qrValueFor } from '../../src/services/inventory';
import { printLabels } from '../../src/lib/labels';
import { cmyk, colors } from '../../src/theme';

const TYPES: { value: string; label: string; icon: IconName }[] = [
  { value: 'room', label: 'Room', icon: 'home-outline' },
  { value: 'rack', label: 'Rack', icon: 'server-outline' },
  { value: 'shelf', label: 'Shelf', icon: 'reorder-four-outline' },
  { value: 'hook', label: 'Hook', icon: 'git-pull-request-outline' },
  { value: 'bin', label: 'Bin', icon: 'archive-outline' },
];
const typeIcon = (t: string) => TYPES.find((x) => x.value === t)?.icon ?? 'location-outline';
const TYPE_COLOR: Record<string, string> = { room: cmyk.cyan, rack: cmyk.magenta, shelf: cmyk.cyan, hook: cmyk.yellow, bin: cmyk.magenta };

/** Racks, shelves, hooks and bins each get a QR so staff can scan a place to see what's in it. */
export default function Locations() {
  const [locations, reload] = useFocusQuery(listLocations);
  const [name, setName] = useState('');
  const [type, setType] = useState('shelf');
  const toast = useToast();

  const add = () => {
    try {
      createLocation(name, type);
      toast(`${name.trim()} added`);
      setName('');
      reload();
    } catch (e) {
      toast(e instanceof InventoryError ? e.message : String(e), 'error');
    }
  };

  const printAll = () => printLabels(locations.map((l) => ({ code: l.code, title: l.name, subtitle: `Location · ${l.type}` })));

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => (locations.length ? <IconButton icon="print-outline" onPress={printAll} size={18} /> : null) }} />
      <Card>
        <Field label="New location" icon="location-outline" value={name} onChangeText={setName} placeholder="Cable Wall / Hook 3" onSubmitEditing={add} returnKeyType="done" />
        <Chips options={TYPES} value={type} onChange={setType} scroll />
        <Button title="Add location" icon="add" onPress={add} disabled={!name.trim()} />
      </Card>

      <SectionTitle>{locations.length} locations</SectionTitle>
      <Card padded={false}>
        {locations.length === 0 ? (
          <Empty icon="location-outline" text="Add your racks, shelves, hooks and bins, then print their QR labels." />
        ) : (
          locations.map((l, i) => (
            <Row
              key={l.id}
              icon={typeIcon(l.type)}
              iconColor={TYPE_COLOR[l.type] ?? cmyk.cyan}
              title={l.name}
              subtitle={`${l.code} · ${l.type}`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text }}>{l.item_count}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>items</Text>
                </View>
              }
              onPress={() => router.push(`/locations/${l.id}`)}
              last={i === locations.length - 1}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
