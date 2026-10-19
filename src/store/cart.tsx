import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AssetView, LotView } from '../domain/types';

/** Multi-scan cart: scan many items, review, then issue/return everything as one transaction. */
export type CartEntry =
  | { entityType: 'asset'; item: AssetView }
  | { entityType: 'lot'; item: LotView; quantity: number };

interface CartContextValue {
  entries: CartEntry[];
  add: (entry: CartEntry) => 'added' | 'duplicate';
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const ref = useRef(entries);
  ref.current = entries;

  const add = useCallback((entry: CartEntry) => {
    if (ref.current.some((e) => e.item.id === entry.item.id)) return 'duplicate';
    ref.current = [entry, ...ref.current];
    setEntries(ref.current);
    return 'added';
  }, []);

  const remove = useCallback((id: string) => {
    ref.current = ref.current.filter((e) => e.item.id !== id);
    setEntries(ref.current);
  }, []);
  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      ref.current = ref.current.map((e) => (e.item.id === id && e.entityType === 'lot' ? { ...e, quantity } : e));
      setEntries(ref.current);
    },
    [],
  );
  const clear = useCallback(() => {
    ref.current = [];
    setEntries(ref.current);
  }, []);

  const value = useMemo(() => ({ entries, add, remove, setQuantity, clear }), [entries, add, remove, setQuantity, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
