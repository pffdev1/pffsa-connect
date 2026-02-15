import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const CartContext = createContext();

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

  // Añadir o incrementar cantidad
  const addToCart = (product) => {
    setCart((prevCart) => {
      const exists = prevCart.find(item => item.ItemCode === product.ItemCode);
      if (exists) {
        return prevCart.map(item =>
          item.ItemCode === product.ItemCode 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  // Eliminar o decrementar
  const removeFromCart = (itemCode) => {
    setCart((prevCart) => {
      const item = prevCart.find(i => i.ItemCode === itemCode);
      if (item && item.quantity > 1) {
        return prevCart.map(i => i.ItemCode === itemCode ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prevCart.filter(i => i.ItemCode !== itemCode);
    });
  };

  const clearCart = () => setCart([]);

  const getTotal = () => cart.reduce((acc, item) => acc + (item.Price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, getTotal }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
