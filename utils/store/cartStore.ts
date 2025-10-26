// store/cartStore.ts
import { create } from "zustand";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
}

interface CartStore {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;

}

import { persist } from "zustand/middleware";

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addToCart: (item) => {
        const existing = get().items.find((i) => i.id === item.id);
        let updatedCart;

        if (existing) {
          updatedCart = get().items.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
          );
        } else {
          updatedCart = [...get().items, item];
        }
        set({ items: updatedCart });
      },
      removeFromCart: (id) => {
        const updatedCart = get().items.filter((i) => i.id !== id);
        console.log(get().items.map(i => i.id));
        console.log("removing id:", id);
        set({ items: updatedCart });
      },
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "cart", // key in localStorage
       storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "cart" && event.newValue) {
      const newState = JSON.parse(event.newValue).state;
      useCartStore.setState(newState);
    }
  });
}

