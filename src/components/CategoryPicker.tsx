import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chips, Field, hexA, Label, SuggestField, tap } from './ui';
import { findTaxonomy, Subcategory, TAXONOMY } from '../domain/taxonomy';
import { listCategories } from '../services/inventory';
import { colors, radius, space, type } from '../theme';

const CUSTOM = '__custom';

/**
 * Two-step picker: tap a group tile (Cables, Tools, IoT…), then a subcategory chip (HDMI, Cat6…).
 * "Custom" lets staff type any category and subcategory not in the built-in list.
 */
export function CategoryPicker({
  category,
  subcategory,
  onChange,
}: {
  category: string;
  subcategory: string;
  onChange: (category: string, subcategory: string, sub?: Subcategory) => void;
}) {
  const match = findTaxonomy(category, subcategory);
  const [custom, setCustom] = useState(() => !!category && !match);
  const groupCode = custom ? CUSTOM : match?.group.code ?? null;
  const group = TAXONOMY.find((g) => g.code === groupCode);
  const customCategories = useMemo(() => listCategories().filter((c) => !findTaxonomy(c)), []);

  return (
    <View>
      <Label>Category</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} style={{ marginHorizontal: -space.lg }} keyboardShouldPersistTaps="handled">
        {TAXONOMY.map((g) => {
          const active = g.code === groupCode;
          return (
            <Pressable
              key={g.code}
              onPress={() => {
                tap();
                setCustom(false);
                onChange(g.name, '');
              }}
              style={[styles.tile, { borderColor: active ? g.color : colors.border, backgroundColor: active ? hexA(g.color, 0.16) : colors.surface }]}
            >
              <Ionicons name={g.icon} size={22} color={active ? g.color : colors.textMuted} />
              <Text style={[styles.tileText, active && { color: colors.text }]} numberOfLines={2}>{g.name}</Text>
              <Text style={[styles.tileCode, { color: active ? g.color : colors.textFaint }]}>{g.code}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            tap();
            setCustom(true);
            onChange('', '');
          }}
          style={[styles.tile, { borderColor: custom ? colors.primary : colors.border, backgroundColor: custom ? colors.primarySoft : colors.surface }]}
        >
          <Ionicons name="create-outline" size={22} color={custom ? colors.primary : colors.textMuted} />
          <Text style={[styles.tileText, custom && { color: colors.text }]}>Custom</Text>
          <Text style={[styles.tileCode, { color: colors.textFaint }]}>type</Text>
        </Pressable>
      </ScrollView>

      {group ? (
        <>
          <Label>{group.name} › type</Label>
          <Chips
            options={group.subs.map((s) => ({ value: s.code, label: s.name }))}
            value={match?.sub?.code ?? null}
            onChange={(code) => {
              const sub = group.subs.find((s) => s.code === code)!;
              onChange(group.name, sub.name, sub);
            }}
          />
        </>
      ) : null}

      {custom ? (
        <>
          <SuggestField label="Category name" value={category} onChangeText={(v) => onChange(v, subcategory)} suggestions={customCategories} placeholder="e.g. Stage props" icon="pricetag-outline" />
          <Field label="Type (optional)" value={subcategory} onChangeText={(v) => onChange(category, v)} placeholder="e.g. Foam letters" autoCapitalize="words" />
        </>
      ) : null}

      {!group && !custom ? <Text style={[type.caption, { marginBottom: space.md }]}>Pick a group above, or Custom to type your own.</Text> : null}
    </View>
  );
}

/** Tappable quick-picks for the sub-name, from the chosen subcategory (lengths, models…). */
export function VariantChips({ variants, value, onPick }: { variants?: string[]; value: string; onPick: (v: string) => void }) {
  if (!variants?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: -4, marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {variants.map((v) => {
          const active = v === value;
          return (
            <Pressable key={v} onPress={() => { tap(); onPick(v); }} style={[styles.variant, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[styles.variantText, active && { color: '#fff' }]}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  tile: { width: 92, height: 96, borderRadius: radius.md, borderWidth: 1, padding: 10, justifyContent: 'space-between' },
  tileText: { color: colors.textMuted, fontWeight: '700', fontSize: 12, lineHeight: 15 },
  tileCode: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  variant: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  variantText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
