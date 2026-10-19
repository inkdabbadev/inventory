import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { Card, Field, IconBubble, IconButton, Row, Screen, SectionTitle, tap } from '../src/components/ui';
import { useFocusQuery } from '../src/hooks/useRefresh';
import { categoryCounts } from '../src/services/inventory';
import { findTaxonomy, TAXONOMY } from '../src/domain/taxonomy';
import { colors, radius, space, type } from '../src/theme';

const key = (c?: string | null, s?: string | null) => `${(c ?? '').toLowerCase()}|${(s ?? '').toLowerCase()}`;

/** Browse the catalog by group › type, with live counts and the code for each. */
export default function Categories() {
  const [rows] = useFocusQuery(categoryCounts);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const n = r.units + r.lots;
      m.set(key(r.category, r.subcategory), (m.get(key(r.category, r.subcategory)) ?? 0) + n);
      m.set(key(r.category, null) + '*', (m.get(key(r.category, null) + '*') ?? 0) + n);
    }
    return m;
  }, [rows]);

  // Categories typed by staff that aren't in the built-in list.
  const custom = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.category || findTaxonomy(r.category)) continue;
      if (!m.has(r.category)) m.set(r.category, new Set());
      if (r.subcategory) m.get(r.category)!.add(r.subcategory);
    }
    return [...m.entries()];
  }, [rows]);

  const needle = q.trim().toLowerCase();
  const groups = TAXONOMY.map((g) => ({
    ...g,
    subs: needle ? g.subs.filter((s) => `${g.name} ${s.name} ${g.code}-${s.code} ${(s.variants ?? []).join(' ')}`.toLowerCase().includes(needle)) : g.subs,
  })).filter((g) => !needle || g.subs.length || g.name.toLowerCase().includes(needle));

  const browse = (category: string, sub?: string) =>
    router.push(`/inventory?category=${encodeURIComponent(category)}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}` as never);

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="print-outline" size={18} onPress={printGuide} /> }} />
      <Field label="" icon="search" value={q} onChangeText={setQ} placeholder="Find a type: hdmi, drill, esp32, gaffer…" autoCorrect={false} clearButtonMode="while-editing" />
      <Text style={[type.caption, { marginBottom: space.md }]}>
        Codes read <Text style={[type.mono, { color: colors.text }]}>GROUP-TYPE-0001</Text>, e.g. <Text style={[type.mono, { color: colors.primary }]}>CBL-HDM-0007</Text> = Cables › HDMI #7.
      </Text>

      {groups.map((g) => {
        const expanded = open === g.code || !!needle;
        const total = counts.get(key(g.name, null) + '*') ?? 0;
        return (
          <Card key={g.code} padded={false}>
            <Pressable
              onPress={() => {
                tap();
                setOpen(expanded && !needle ? null : g.code);
              }}
              style={styles.groupRow}
            >
              <IconBubble icon={g.icon} color={g.color} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={type.headline}>{g.name}</Text>
                <Text style={[type.caption, type.mono]}>{g.code} · {g.subs.length} types</Text>
              </View>
              <Text style={[styles.count, { color: total ? colors.text : colors.textFaint }]}>{total}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
            </Pressable>
            {expanded ? (
              <View style={styles.subs}>
                {g.subs.map((s, i) => {
                  const n = counts.get(key(g.name, s.name)) ?? 0;
                  return (
                    <Row
                      key={s.code}
                      title={s.name}
                      subtitle={`${g.code}-${s.code} · ${s.track === 'each' ? 'each piece' : `by ${s.unit ?? 'qty'}`}`}
                      right={<Text style={[styles.count, { color: n ? g.color : colors.textFaint }]}>{n}</Text>}
                      onPress={() => browse(g.name, s.name)}
                      last={i === g.subs.length - 1}
                    />
                  );
                })}
              </View>
            ) : null}
          </Card>
        );
      })}

      {custom.length && !needle ? (
        <>
          <SectionTitle>Your custom categories</SectionTitle>
          <Card padded={false}>
            {custom.map(([c, subs], i) => (
              <Row
                key={c}
                icon="pricetag"
                iconColor={colors.textMuted}
                title={c}
                subtitle={subs.size ? [...subs].join(', ') : 'No types'}
                right={<Text style={styles.count}>{counts.get(key(c, null) + '*') ?? 0}</Text>}
                onPress={() => browse(c)}
                last={i === custom.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** One-page code guide to stick on the store-room wall. */
async function printGuide() {
  const groups = TAXONOMY.map(
    (g) => `<div class="g"><h2><span style="background:${g.color}"></span>${g.code} · ${g.name}</h2><table>${g.subs
      .map((s) => `<tr><td class="c">${g.code}-${s.code}</td><td>${s.name}</td><td class="t">${s.track === 'each' ? 'each' : s.unit ?? 'qty'}</td></tr>`)
      .join('')}</table></div>`,
  ).join('');
  await Print.printAsync({
    html: `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { margin: 10mm; } body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #111; }
      h1 { font-size: 16pt; margin: 0 0 2mm; } p { margin: 0 0 4mm; font-size: 9pt; color: #555; }
      .wrap { columns: 3; column-gap: 6mm; } .g { break-inside: avoid; margin-bottom: 4mm; }
      h2 { font-size: 10pt; margin: 0 0 1mm; display: flex; align-items: center; gap: 2mm; }
      h2 span { width: 3mm; height: 3mm; border-radius: 1mm; display: inline-block; }
      table { width: 100%; border-collapse: collapse; font-size: 8pt; } td { padding: 0.6mm 0; border-bottom: 0.2mm solid #eee; }
      .c { font-family: Menlo, monospace; font-weight: 700; width: 20mm; } .t { color: #888; text-align: right; }
    </style></head><body><h1>INK DABBA · Inventory codes</h1><p>Label format GROUP-TYPE-NUMBER · e.g. CBL-HDM-0007 = Cables › HDMI, unit 7</p><div class="wrap">${groups}</div></body></html>`,
  });
}

const styles = StyleSheet.create({
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  subs: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: 'rgba(255,255,255,0.02)', borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  count: { fontWeight: '800', fontSize: 16, color: colors.text, minWidth: 28, textAlign: 'right' },
});
