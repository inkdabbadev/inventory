import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chips, Field, Label } from './ui';
import { useToast } from './Toast';
import { createLocation, createProject, InventoryError, listLocations, listProjects } from '../services/inventory';
import { space } from '../theme';

/** Chip picker with inline "+ New" so staff never get stuck mid-checkout. */
function InlinePicker({
  label,
  value,
  onChange,
  load,
  create,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  load: () => { id: string; name: string }[];
  create: (name: string) => string;
  placeholder: string;
}) {
  const [items, setItems] = useState(load);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();

  const add = () => {
    try {
      const id = create(name);
      setItems(load());
      onChange(id);
      setAdding(false);
      setName('');
    } catch (e) {
      toast(e instanceof InventoryError ? e.message : String(e), 'error');
    }
  };

  return (
    <View>
      <Label>{label}</Label>
      <Chips
        options={[...items.map((p) => ({ value: p.id, label: p.name })), { value: '__new', label: 'New', icon: 'add' as const }]}
        value={value}
        onChange={(v) => (v === '__new' ? setAdding(true) : onChange(v))}
        scroll
      />
      {adding ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label="" value={name} onChangeText={setName} placeholder={placeholder} autoFocus onSubmitEditing={add} returnKeyType="done" />
          </View>
          <Button title="Add" icon="add" onPress={add} disabled={!name.trim()} />
        </View>
      ) : null}
    </View>
  );
}

export function ProjectPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  return <InlinePicker label="Project / event" value={value} onChange={onChange} load={() => listProjects()} create={createProject} placeholder="e.g. Diwali Expo 2026" />;
}

export function LocationPicker({ value, onChange, label = 'Location' }: { value: string | null; onChange: (id: string) => void; label?: string }) {
  return <InlinePicker label={label} value={value} onChange={onChange} load={listLocations} create={(n) => createLocation(n, 'shelf')} placeholder="e.g. Cable Wall / Hook 3" />;
}
