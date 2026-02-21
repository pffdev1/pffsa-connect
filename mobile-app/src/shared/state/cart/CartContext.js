import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalSupabaseSession, isInvalidRefreshTokenError, supabase } from '../../infrastructure/supabaseClient';

const CartContext = createContext();
const roundQty = (value) => Math.round(value * 1000) / 1000;
const toSafeString = (value) => String(value || '').trim();
const buildCartKey = (item = {}) => `${toSafeString(item.CardCode)}::${toSafeString(item.ItemCode)}`;
const matchesCartIdentifier = (item, identifier) =>
  item?.cartKey === identifier || toSafeString(item?.ItemCode) === identifier;
const CART_STORAGE_KEY_PREFIX = 'cart:v1:user:';
const getCartStorageKey = (userId) => `${CART_STORAGE_KEY_PREFIX}${toSafeString(userId)}`;

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const [cartOwnerId, setCartOwnerId] = useState(null);
  const [cartHydrated, setCartHydrated] = useState(false);
  const currentUserIdRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const hydrateCartForUser = async (userId) => {
      const safeUserId = toSafeString(userId);
      if (!safeUserId) {
        if (!mounted) return;
        setCart([]);
        setCartOwnerId(null);
        setCartHydrated(true);
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(getCartStorageKey(safeUserId));
        if (!mounted) return;
        const parsed = raw ? JSON.parse(raw) : [];
        setCart(Array.isArray(parsed) ? parsed : []);
      } catch (_error) {
        if (!mounted) return;
        setCart([]);
      } finally {
        if (!mounted) return;
        setCartOwnerId(safeUserId);
        setCartHydrated(true);
      }
    };

    const initUser = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!mounted) return;
        const safeUserId = user?.id || null;
        currentUserIdRef.current = safeUserId;
        await hydrateCartForUser(safeUserId);
      } catch (error) {
        if (!mounted) return;
        if (isInvalidRefreshTokenError(error)) {
          await clearLocalSupabaseSession();
        }
        currentUserIdRef.current = null;
        await hydrateCartForUser(null);
      }
    };

    initUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUserId = session?.user?.id || null;
      if (currentUserIdRef.current !== nextUserId) {
        currentUserIdRef.current = nextUserId;
        setCartHydrated(false);
        await hydrateCartForUser(nextUserId);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!cartHydrated || !cartOwnerId) return;
    AsyncStorage.setItem(getCartStorageKey(cartOwnerId), JSON.stringify(cart)).catch(() => {});
  }, [cart, cartHydrated, cartOwnerId]);

  // Add or increment quantity (supports decimals, e.g. 1.5 KG)
  const addToCart = (product) => {
    const safeCardCode = toSafeString(product?.CardCode);
    const safeItemCode = toSafeString(product?.ItemCode);
    if (!safeCardCode || !safeItemCode) return;

    const rawQuantity = String(product?.quantity ?? '1').replace(',', '.');
    const parsedQuantity = Number(rawQuantity);
    const quantityToAdd = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
    const normalizedQuantityToAdd = roundQty(quantityToAdd);
    const nextProduct = {
      ...product,
      CardCode: safeCardCode,
      ItemCode: safeItemCode,
      quantity: normalizedQuantityToAdd,
      cartKey: buildCartKey({ CardCode: safeCardCode, ItemCode: safeItemCode })
    };

    setCart((prevCart) => {
      const currentCardCode = toSafeString(prevCart[0]?.CardCode);
      const nextCartBase = currentCardCode && currentCardCode !== safeCardCode ? [] : prevCart;
      const exists = nextCartBase.find((item) => item.cartKey === nextProduct.cartKey);
      if (exists) {
        return nextCartBase.map((item) =>
          item.cartKey === nextProduct.cartKey
            ? { ...item, quantity: roundQty(item.quantity + normalizedQuantityToAdd) }
            : item
        );
      }
      return [...nextCartBase, nextProduct];
    });
  };

  const updateCartItemQuantity = (identifier, nextQuantity) => {
    const parsed = Number(String(nextQuantity ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return;

    const normalizedNext = roundQty(parsed);
    setCart((prevCart) => {
      if (normalizedNext <= 0) {
        return prevCart.filter((item) => !matchesCartIdentifier(item, identifier));
      }
      return prevCart.map((item) => (matchesCartIdentifier(item, identifier) ? { ...item, quantity: normalizedNext } : item));
    });
  };

  // Remove or decrement using a decimal-friendly step.
  const removeFromCart = (identifier, step = 1) => {
    const parsedStep = Number(String(step ?? '').replace(',', '.'));
    const decrement = Number.isFinite(parsedStep) && parsedStep > 0 ? roundQty(parsedStep) : 1;

    setCart((prevCart) => {
      const item = prevCart.find((i) => matchesCartIdentifier(i, identifier));
      if (item && item.quantity > decrement) {
        return prevCart.map((i) =>
          matchesCartIdentifier(i, identifier) ? { ...i, quantity: roundQty(i.quantity - decrement) } : i
        );
      }
      return prevCart.filter((i) => !matchesCartIdentifier(i, identifier));
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
