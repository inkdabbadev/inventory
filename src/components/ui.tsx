import React, { memo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cmyk, colors, gradients, radius, space, statusColors, TAB_BAR_SPACE, type } from '../theme';

/** Shared height so inputs, buttons and steppers line up when placed side by side. */
export const CONTROL_HEIGHT = 52;
export const CONTROL_HEIGHT_COMPACT = 44;
/** Glass outline width; bordered controls subtract it so their outer size matches gradient buttons. */
const GLASS_BORDER = StyleSheet.hairlineWidth * 2;

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

const isIOS = Platform.OS === 'ios';
export const tap = () => Haptics.selectionAsync().catch(() => {});

/** Header height for screens rendered under a transparent, blurred navigation bar. */
export function useHeaderSpace() {
  const insets = useSafeAreaInsets();
  return insets.top + (isIOS ? 44 : 56);
}

// ---------------------------------------------------------------------------
// Backdrop: plain key-black canvas (subtle vertical gradient, no decorations)
// ---------------------------------------------------------------------------
export const Backdrop = memo(function Backdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={gradients.canvas} style={StyleSheet.absoluteFill} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function Screen({
  children,
  scroll = true,
  style,
  tabs = false,
  header = true,
  footer,
  onRefresh,
  top,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  /** leave room for the floating tab bar */
  tabs?: boolean;
  /** content sits under a transparent nav bar */
  header?: boolean;
  /** sticky glass action bar pinned to the bottom (primary action always reachable) */
  footer?: React.ReactNode;
  /** enables pull-to-refresh */
  onRefresh?: () => Promise<unknown> | void;
  /** explicit top padding (e.g. inside an iOS sheet, where there is no status bar) */
  top?: number;
}) {
  const headerSpace = useHeaderSpace();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const bottom = footer ? FOOTER_HEIGHT + insets.bottom + space.lg : tabs ? TAB_BAR_SPACE : insets.bottom + space.xxl;
  const pad = { paddingTop: top ?? (header ? headerSpace + space.sm : insets.top + space.sm), paddingBottom: bottom };
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <View style={styles.fill}>
      <Backdrop />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screen, pad, style]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          refreshControl={
            refresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary, cmyk.magenta]} progressBackgroundColor={colors.backgroundRaised} progressViewOffset={header ? headerSpace : insets.top} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, style]}>{children}</View>
      )}
      {footer ? <BottomBar>{footer}</BottomBar> : null}
    </View>
  );
}

const FOOTER_HEIGHT = CONTROL_HEIGHT + space.md * 2;

/** Frosted bar pinned above the home indicator; holds one primary action (or a pair). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.bottomBarWrap} pointerEvents="box-none">
      <Glass radius={0} intensity={60} tint="rgba(8,8,13,0.72)" style={styles.bottomBar}>
        <View style={[styles.bottomBarInner, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{children}</View>
      </Glass>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Glass surfaces
// ---------------------------------------------------------------------------
export function Glass({
  children,
  style,
  intensity = 28,
  radius: r = radius.lg,
  tint,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  tint?: string;
}) {
  return (
    <View style={[{ borderRadius: r, overflow: 'hidden', borderWidth: GLASS_BORDER, borderColor: colors.border }, style]}>
      {isIOS ? (
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,34,0.82)' }]} />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ?? colors.surface }]} />
      <LinearGradient colors={gradients.sheen} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} />
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  tint,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tint?: string;
  padded?: boolean;
}) {
  const body = (
    <Glass style={[styles.card, style]} tint={tint}>
      <View style={padded ? { padding: space.lg } : undefined}>{children}</View>
    </Glass>
  );
  if (!onPress) return body;
  const [outer, inner] = splitLayout([styles.card, style]);
  return (
    <PressScale onPress={onPress} style={outer}>
      <Glass style={[inner, { flexGrow: 1 }]} tint={tint}>
        <View style={padded ? { padding: space.lg } : undefined}>{children}</View>
      </Glass>
    </PressScale>
  );
}

/** Spring scale feedback used by every tappable surface. */
export function PressScale({
  children,
  onPress,
  disabled,
  style,
  haptic = true,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  // One element carries both layout (flex, width, margins) and the scale transform,
  // so flex:1 / width:'33%' apply to the visible surface, not an invisible wrapper.
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      onPress={() => {
        if (haptic) tap();
        onPress?.();
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'opacity',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom',
]);

/** Splits a style into the outer slot (layout) and the inner surface (looks). */
function splitLayout(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (LAYOUT_KEYS.has(k) ? outer : inner)[k] = v;
  return [outer as ViewStyle, inner as ViewStyle];
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warm';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const fg = variant === 'primary' || variant === 'warm' ? '#fff' : variant === 'danger' ? colors.error : variant === 'ghost' ? colors.primary : colors.text;
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.buttonInner}>
      {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      <Text style={[styles.buttonText, compact && { fontSize: 14 }, { color: fg }]} numberOfLines={1}>{title}</Text>
    </View>
  );
  const h = compact ? CONTROL_HEIGHT_COMPACT : CONTROL_HEIGHT;

  return (
    <PressScale onPress={onPress} disabled={disabled || loading} style={[{ opacity: disabled ? 0.4 : 1 }, style]}>
      {variant === 'primary' || variant === 'warm' ? (
        <LinearGradient
          colors={variant === 'primary' ? gradients.cm : gradients.my}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, { height: h }, styles.glowShadow]}
        >
          {content}
        </LinearGradient>
      ) : variant === 'ghost' ? (
        <View style={[styles.button, { height: h }]}>{content}</View>
      ) : (
        <Glass radius={radius.md} style={{ borderColor: variant === 'danger' ? 'rgba(255,61,154,0.45)' : colors.borderStrong }}>
          <View style={[styles.button, { height: h - GLASS_BORDER * 2 }]}>{content}</View>
        </Glass>
      )}
    </PressScale>
  );
}

export function IconButton({ icon, onPress, color = colors.text, size = 20 }: { icon: IconName; onPress: () => void; color?: string; size?: number }) {
  return (
    <PressScale onPress={onPress}>
      <Glass radius={radius.pill} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={size} color={color} />
      </Glass>
    </PressScale>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export function Field({ label, hint, icon, ...props }: TextInputProps & { label: string; hint?: string; icon?: IconName }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Glass radius={radius.md} style={[focused && { borderColor: colors.primary }]} tint={focused ? 'rgba(0,174,239,0.08)' : undefined}>
        <View style={styles.inputRow}>
          {icon ? <Ionicons name={icon} size={18} color={focused ? colors.primary : colors.textMuted} style={{ marginLeft: space.lg }} /> : null}
          <TextInput
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            keyboardAppearance="dark"
            {...props}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            style={[styles.input, props.multiline && { minHeight: 84, textAlignVertical: 'top', paddingTop: 14 }, props.style]}
          />
        </View>
      </Glass>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Compact numeric input used inside list rows (cart quantities, audit counts). */
export function QtyInput(props: TextInputProps) {
  return (
    <TextInput
      keyboardType="decimal-pad"
      placeholderTextColor={colors.textFaint}
      selectionColor={colors.primary}
      keyboardAppearance="dark"
      selectTextOnFocus
      {...props}
      style={[styles.qty, props.style]}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
export function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] ?? statusColors.retired;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg, shadowColor: s.fg }]} />
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  scroll = false,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T | null;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  const chips = options.map((o) => {
    const active = o.value === value;
    return (
      <PressScale key={o.value} onPress={() => onChange(o.value)}>
        {active ? (
          <LinearGradient colors={gradients.cm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>
            {o.icon ? <Ionicons name={o.icon} size={14} color="#fff" /> : null}
            <Text style={[styles.chipText, { color: '#fff' }]}>{o.label}</Text>
          </LinearGradient>
        ) : (
          <Glass radius={radius.pill}>
            <View style={styles.chip}>
              {o.icon ? <Ionicons name={o.icon} size={14} color={colors.textMuted} /> : null}
              <Text style={styles.chipText}>{o.label}</Text>
            </View>
          </Glass>
        )}
      </PressScale>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { flexWrap: 'nowrap' }]} style={{ marginHorizontal: -space.lg }}>
        <View style={{ width: space.lg - space.sm }} />
        {chips}
        <View style={{ width: space.lg - space.sm }} />
      </ScrollView>
    );
  }
  return <View style={styles.chips}>{chips}</View>;
}

/** iOS-style segmented control on glass. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <Glass radius={radius.md} style={{ marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', padding: 4, gap: 4 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={o.value} style={{ flex: 1 }} onPress={() => { tap(); onChange(o.value); }}>
              {active ? (
                <LinearGradient colors={gradients.cm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.segment}>
                  <Text style={[styles.segmentText, { color: '#fff' }]}>{o.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.segment}>
                  <Text style={styles.segmentText}>{o.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.overline}>{children}</Text>
      {right}
    </View>
  );
}

export function IconBubble({ icon, color = colors.primary, size = 38 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(color, 0.16), borderWidth: 1, borderColor: hexA(color, 0.3) }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export const Row = memo(function Row({
  title,
  subtitle,
  right,
  onPress,
  icon,
  iconColor,
  last,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  onPress?: () => void;
  icon?: IconName;
  iconColor?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress ? () => { tap(); onPress(); } : undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}
    >
      {icon ? <View style={{ marginRight: space.md }}><IconBubble icon={icon} color={iconColor} size={36} /></View> : null}
      <View style={{ flex: 1, paddingRight: space.sm }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
});

export function Empty({
  text,
  icon = 'cube-outline',
  action,
}: {
  text: string;
  icon?: IconName;
  /** optional next step, e.g. "Add item" */
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      {action ? <Button title={action.label} icon={action.icon ?? 'add'} onPress={action.onPress} compact variant="secondary" style={{ marginTop: space.sm, minWidth: 160 }} /> : null}
    </View>
  );
}

export function GradientText({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  // Lightweight stand-in: cyan text with magenta glow (true gradient text needs masked-view).
  return <Text style={[type.largeTitle, { color: colors.text, textShadowColor: 'rgba(0,174,239,0.45)', textShadowRadius: 18 }, style as object]}>{children}</Text>;
}

/** '#RRGGBB' + alpha -> rgba() */
export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  screen: { paddingHorizontal: space.lg, flexGrow: 1 },
  card: { marginBottom: space.md },
  glowShadow: {
    shadowColor: cmyk.magenta,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  button: { borderRadius: radius.md, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  buttonText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.1, flexShrink: 1, textAlign: 'center' },
  label: { ...type.overline, fontSize: 11, marginBottom: 8, marginLeft: 2 },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 6, marginLeft: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: CONTROL_HEIGHT - GLASS_BORDER * 2, paddingHorizontal: space.lg, paddingVertical: 12, fontSize: 16, color: colors.text, fontWeight: '500' },
  qty: {
    minWidth: 76,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  badgeText: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  segment: { borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: space.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text, letterSpacing: -0.1 },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: space.xl, paddingHorizontal: space.lg, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bottomBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBar: { borderWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  bottomBarInner: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  emptyText: { textAlign: 'center', color: colors.textMuted, paddingHorizontal: space.lg },
  h1: { ...type.title },
  muted: { color: colors.textMuted, fontSize: 13 },
});

/** iOS large-title header for tab roots (no native header there). */
export function LargeHeader({ title, subtitle, right }: { title: string; subtitle?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.lg, marginTop: space.sm }}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={[type.overline, { marginBottom: 4 }]}>{subtitle}</Text> : null}
        <GradientText>{title}</GradientText>
      </View>
      {right ? <View style={{ flexDirection: 'row', gap: space.sm }}>{right}</View> : null}
    </View>
  );
}

/** Free-text field with tappable suggestions that filter as you type (used for categories). */
export function SuggestField({
  label,
  value,
  onChangeText,
  suggestions,
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  icon?: IconName;
}) {
  const q = value.trim().toLowerCase();
  const shown = suggestions.filter((s) => s.toLowerCase() !== q && (!q || s.toLowerCase().includes(q))).slice(0, 8);
  return (
    <View>
      <Field label={label} icon={icon} value={value} onChangeText={onChangeText} placeholder={placeholder} autoCapitalize="words" />
      {shown.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: -4, marginBottom: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {shown.map((s) => (
              <Pressable key={s} onPress={() => { tap(); onChangeText(s); }} style={extra.suggestion}>
                <Text style={extra.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

/** − n + control for small counts. */
export function Stepper({ value, onChange, min = 1, max = 9999 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const set = (n: number) => { tap(); onChange(Math.max(min, Math.min(max, n))); };
  return (
    <Glass radius={radius.md}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => set(value - 1)} style={extra.stepBtn} hitSlop={6}>
          <Ionicons name="remove" size={22} color={value <= min ? colors.textFaint : colors.text} />
        </Pressable>
        <TextInput
          value={String(value)}
          onChangeText={(t) => onChange(Math.max(min, Math.min(max, parseInt(t.replace(/\D/g, ''), 10) || min)))}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          selectTextOnFocus
          style={extra.stepValue}
        />
        <Pressable onPress={() => set(value + 1)} style={extra.stepBtn} hitSlop={6}>
          <Ionicons name="add" size={22} color={colors.text} />
        </Pressable>
      </View>
    </Glass>
  );
}

const extra = StyleSheet.create({
  suggestion: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: 'rgba(0,174,239,0.35)' },
  suggestionText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  stepBtn: { width: CONTROL_HEIGHT, height: CONTROL_HEIGHT - GLASS_BORDER * 2, alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '800', color: colors.text },
});
