import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chips, Field, hexA, Label, Screen, Segmented, Stepper } from '../src/components/ui';
import { CategoryPicker, VariantChips } from '../src/components/CategoryPicker';
import { codePrefixFor, findTaxonomy, Subcategory } from '../src/domain/taxonomy';
import { LocationPicker } from '../src/components/pickers';
import { useToast } from '../src/components/Toast';
import { categoryPath, createItem, derivePrefix, fullName, getAsset, getLot, InventoryError, nextItemCode, qrValueFor } from '../src/services/inventory';
import { printLabels } from '../src/lib/labels';
import { colors, space, type } from '../src/theme';

type Track = 'each' | 'quantity';

/** 'Cables' + 'HDMI' -> 'HDMI cable'; 'Loose wire (by metre)' -> 'Loose wire'; others use the type name. */
function defaultName(category: string, sub: string) {
  const clean = sub.replace(/\s*\(.*\)\s*/, '').trim();
  const isCable = category === 'Cables' && !/cable|wire|cord|board|drum|coil/i.test(clean);
  return isCable ? `${clean} cable` : clean;
}

/** Units that are measured (used up partially) rather than counted. */
const MEASURED = new Set(['m', 'ft', 'kg', 'g', 'l', 'ml', 'roll']);
const UNITS = ['pcs', 'm', 'box', 'roll', 'kg', 'l', 'set', 'pair'].map((u) => ({ value: u, label: u }));

export default function AddItem() {
  const { barcode: scannedBarcode } = useLocalSearchParams<{ barcode?: string }>();
  const toast = useToast();

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [subname, setSubname] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [variants, setVariants] = useState<string[] | undefined>();
  const [track, setTrack] = useState<Track>('each');
  const [pieces, setPieces] = useState(1);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [more, setMore] = useState(!!scannedBarcode);
  const [prefix, setPrefix] = useState('');
  const [barcode, setBarcode] = useState(scannedBarcode ?? '');
  const [supplier, setSupplier] = useState('');
  const [saving, setSaving] = useState(false);

  const codePrefix = prefix || codePrefixFor(category, subcategory) || derivePrefix(name) || 'ITEM';
  const firstCode = useMemo(() => nextItemCode(codePrefix), [codePrefix]);
  const kind = track === 'each' ? 'asset' : MEASURED.has(unit) ? 'consumable' : 'quantity';
  const group = findTaxonomy(category)?.group;

  /** Picking a subcategory pre-fills sensible defaults: name, counting mode, unit, sub-name picks. */
  const onCategory = (cat: string, sub: string, meta?: Subcategory) => {
    setCategory(cat);
    setSubcategory(sub);
    setVariants(meta?.variants);
    if (meta) {
      setTrack(meta.track);
      if (meta.unit) setUnit(meta.unit);
      if (!nameTouched) setName(defaultName(cat, meta.name));
    }
  };

  const save = () => {
    setSaving(true);
    try {
      const result = createItem({
        name, subname, category, subcategory, kind, prefix: prefix || undefined, locationId,
        count: pieces, quantity: Number(quantity.replace(',', '.')) || 0, unit, supplier,
        barcode: barcode.trim() || undefined,
      });
      const labels = result.ids.map((id) => {
        const item = result.entityType === 'asset' ? getAsset(id)! : getLot(id)!;
        return { code: item.code, title: fullName(item), subtitle: categoryPath(item), qrValue: qrValueFor(item.code) };
      });
      const first = `/${result.entityType}/${result.ids[0]}`;
      toast(`${fullName({ name: name.trim(), subname: subname.trim() })} added`);
      Alert.alert('Print QR labels?', labels.length === 1 ? labels[0].code : `${labels.length} labels · ${labels[0].code} → ${labels[labels.length - 1].code}`, [
        { text: 'Later', style: 'cancel', onPress: () => router.replace(first as never) },
        { text: 'Print', onPress: () => printLabels(labels).finally(() => router.replace(first as never)) },
      ]);
    } catch (e) {
      toast(e instanceof InventoryError ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Button
            title={track === 'each' && pieces > 1 ? `Save · ${pieces} QR labels` : 'Save item'}
            icon="checkmark"
            onPress={save}
            loading={saving}
            disabled={!name.trim() || (track === 'quantity' && !quantity.trim())}
            style={{ flex: 1 }}
          />
        }
      >
        {/* Live preview of how the item will appear everywhere */}
        <Card tint="rgba(0,174,239,0.06)">
          <Text style={[type.title, !name && { color: colors.textFaint }]} numberOfLines={1}>{name.trim() || 'Item name'}</Text>
          <Text style={[type.body, { color: subname ? colors.textMuted : colors.textFaint, marginTop: 2 }]} numberOfLines={1}>{subname.trim() || 'Sub-name'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {category.trim() ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: hexA(group?.color ?? colors.secondary, 0.16) }}>
                {group ? <Ionicons name={group.icon} size={12} color={group.color} /> : null}
                <Text style={{ color: group?.color ?? '#FF5CB0', fontWeight: '700', fontSize: 12 }}>{categoryPath({ category, subcategory })}</Text>
              </View>
            ) : null}
            <Text style={[type.caption, type.mono, { color: colors.text }]}>
              {firstCode}{track === 'each' && pieces > 1 ? ` … +${pieces - 1}` : ''}
            </Text>
          </View>
        </Card>

        <Card>
          <CategoryPicker category={category} subcategory={subcategory} onChange={onCategory} />
        </Card>

        <Card>
          <Field
            label="Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setNameTouched(true);
            }}
            placeholder="HDMI cable"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Field label="Sub-name" value={subname} onChangeText={setSubname} placeholder={variants?.[0] ?? '1.5 mm · red'} returnKeyType="next" />
          <VariantChips variants={variants} value={subname} onPick={setSubname} />
        </Card>

        <Card>
          <Label>How do you count it?</Label>
          <Segmented
            options={[
              { value: 'each', label: 'Each piece' },
              { value: 'quantity', label: 'By quantity' },
            ]}
            value={track}
            onChange={setTrack}
          />
          {track === 'each' ? (
            <>
              <Stepper value={pieces} onChange={setPieces} max={2000} />
              <Text style={[type.caption, { marginTop: space.sm }]}>Every piece gets its own QR so you know who has it. Good for cables, tools, devices.</Text>
            </>
          ) : (
            <>
              <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="100" />
              <Chips options={UNITS} value={unit} onChange={setUnit} scroll />
              <Text style={[type.caption]}>One QR on the {unit === 'roll' || unit === 'm' ? 'roll' : unit === 'box' ? 'box' : 'pack'}. Record how much is used, e.g. 15 {unit} taken.</Text>
            </>
          )}
        </Card>

        <Card>
          <LocationPicker value={locationId} onChange={setLocationId} label="Kept at (optional)" />
        </Card>

        <Pressable onPress={() => setMore((m) => !m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm, marginBottom: space.sm }}>
          <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontWeight: '600' }}>More options</Text>
        </Pressable>
        {more ? (
          <Card>
            <Field label="Code prefix" value={prefix} onChangeText={(t) => setPrefix(t.toUpperCase())} placeholder={codePrefix} autoCapitalize="characters" maxLength={9} hint="Leave empty to use the category code" />
            <Field label="Product barcode" icon="barcode-outline" value={barcode} onChangeText={setBarcode} placeholder="Optional" />
            <Field label="Supplier" icon="storefront-outline" value={supplier} onChangeText={setSupplier} placeholder="Optional" />
          </Card>
        ) : null}

      </Screen>
    </KeyboardAvoidingView>
  );
}
