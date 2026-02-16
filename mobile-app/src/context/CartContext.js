import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const CartContext = createContext();
const roundQty = (value) => Math.round(value * 1000) / 1000;

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const currentUserIdRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const initUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!mounted) return;
      currentUserIdRef.current = user?.id || null;
    };

    initUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null;
      if (currentUserIdRef.current !== nextUserId) {
        setCart([]);
        currentUserIdRef.current = nextUserId;
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Add or increment quantity (supports decimals, e.g. 1.5 KG)
  const addToCart = (product) => {
    const rawQuantity = String(product?.quantity ?? '1').replace(',', '.');
    const parsedQuantity = Number(rawQuantity);
    const quantityToAdd = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
    const normalizedQuantityToAdd = roundQty(quantityToAdd);

    setCart((prevCart) => {
      const exists = prevCart.find((item) => item.ItemCode === product.ItemCode);
      if (exists) {
        return prevCart.map((item) =>
          item.ItemCode === product.ItemCode
            ? { ...item, quantity: roundQty(item.quantity + normalizedQuantityToAdd) }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: normalizedQuantityToAdd }];
    });
  };

  const updateCartItemQuantity = (itemCode, nextQuantity) => {
    const parsed = Number(String(nextQuantity ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return;

    const normalizedNext = roundQty(parsed);
    setCart((prevCart) => {
      if (normalizedNext <= 0) {
        return prevCart.filter((item) => item.ItemCode !== itemCode);
      }
      return prevCart.map((item) => (item.ItemCode === itemCode ? { ...item, quantity: normalizedNext } : item));
    });
  };

  // Remove or decrement by one unit in cart controls
  const removeFromCart = (itemCode) => {
    setCart((prevCart) => {
      const item = prevCart.find((i) => i.ItemCode === itemCode);
      if (item && item.quantity > 1) {
        return prevCart.map((i) =>
          i.ItemCode === itemCode ? { ...i, quantity: Math.round((i.quantity - 1) * 1000) / 1000 } : i
        );
      }
      return prevCart.filter((i) => i.ItemCode !== itemCode);
    });
  };

  const clearCart = () => setCart([]);

  const getTotal = () => cart.reduce((acc, item) => acc + item.Price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateCartItemQuantity, clearCart, getTotal }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
