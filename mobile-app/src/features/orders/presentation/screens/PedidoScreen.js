import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Button, Card, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalSupabaseSession } from '../../../../shared/infrastructure/supabaseClient';
import {
  classifyOrderError,
  enqueuePendingOrder,
  flushPendingOrders,
  getOrderErrorMessage,
  markPendingOrderError,
  removePendingOrder,
  shouldKeepOrderInQueue,
  submitSalesOrderRpc
} from '../../../../shared/infrastructure/offlineService';
import { useCart } from '../../../../shared/state/cart/CartContext';
import { APP_LAYOUT, COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import {
  fetchCurrentAuthUser,
  fetchCustomerRouteMeta,
  fetchCustomersForValidation,
  fetchSalesOrderStatus
} from '../../infrastructure/ordersRepository';
import { buildClientOrderId, buildOrderLinesPayload } from '../../application/orderBuilders';
import {
  formatDateForDisplay,
  formatDateToISO,
  getToday,
  isValidDeliveryDate,
  parseISODate
} from '../../domain/orderDateRules';

const WAREHOUSE_OPTIONS = [
  { code: '100', name: 'CEDI' },
  { code: '010', name: 'CHIRIQUI' }
];
const SAP_DOCNUM_POLL_ATTEMPTS = 12;
const SAP_DOCNUM_POLL_DELAY_MS = 1000;
const SWIPE_HINT_SEEN_KEY = 'pedido:swipe-hint-seen:v1';
const PRODUCT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const resolveCartImageUrl = (item) => {
  const rawUrl = item?.Url ?? item?.url ?? item?.image_url;
  const safeUrl = String(rawUrl || '').trim();
  return safeUrl || PRODUCT_FALLBACK_IMAGE;
};
const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export default function Pedido() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { cart, addToCart, removeFromCart, updateCartItemQuantity, clearCart, getTotal } = useCart();
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('100');
  const [orderComments, setOrderComments] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [swipeHintReady, setSwipeHintReady] = useState(false);
  const swipeableRefs = useRef(new Map());
  const swipeHintPlayedRef = useRef(false);
  const suppressSwipeDeleteRef = useRef(false);
  const sharePressAnim = useRef(new Animated.Value(1)).current;
  const checkoutScrollRef = useRef(null);
  const CheckoutKeyboardContainer = KeyboardAvoidingView;
  const cartCardCodes = useMemo(
    () => Array.from(new Set(cart.map((item) => String(item?.CardCode || '').trim()).filter(Boolean))),
    [cart]
  );
  const hasMixedClients = cartCardCodes.length > 1;
  const orderCustomerCode = cartCardCodes[0] || '';
  const orderCustomerName = String(cart?.[0]?.CustomerName || cart?.[0]?.CardName || '').trim();
  const openSessionExpiredAlert = (message = 'Tu sesion expiro. Debes iniciar sesion nuevamente.') => {
    setCheckoutModalVisible(false);
    setShowDatePicker(false);
    Alert.alert('Sesion expirada', message, [
      {
        text: 'OK',
        onPress: async () => {
          await clearLocalSupabaseSession();
          clearCart();
          router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
        }
      }
    ]);
  };

  const formatQuantity = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '1';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(3).replace(/\.?0+$/, '');
  };

  const sanitizeQuantityInput = (value) => {
    const raw = String(value || '').replace(',', '.');
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const normalized =
      firstDot === -1 ? cleaned : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;

    if (!normalized) return '';

    const [intPart, decPart] = normalized.split('.');
    const safeInt = intPart ? String(Math.min(999, Number(intPart))) : '0';
    return decPart !== undefined ? `${safeInt}.${decPart.slice(0, 3)}` : safeInt;
  };

  useEffect(() => {
    setQuantityDrafts((prev) => {
      const next = {};
      cart.forEach((item) => {
        const key = item.cartKey || item.ItemCode;
        next[key] = formatQuantity(item.quantity);
      });
      return next;
    });
  }, [cart]);

  const commitDraftQuantity = (identifier, fallbackQuantity) => {
    const raw = String(quantityDrafts[identifier] ?? '').replace(',', '.');
    const parsed = Number(raw);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) / 1000 : null;

    if (normalized === null) {
      setQuantityDrafts((prev) => ({ ...prev, [identifier]: formatQuantity(fallbackQuantity) }));
      return;
    }

    updateCartItemQuantity(identifier, normalized);
    setQuantityDrafts((prev) => ({ ...prev, [identifier]: formatQuantity(normalized) }));
  };
  const handleRemoveItem = (identifier) => {
    updateCartItemQuantity(identifier, 0);
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[identifier];
      return next;
    });
  };

  const renderSwipeRightAction = (dragX, itemKey) => {
    const translateX = dragX.interpolate({
      inputRange: [-160, -20, 0],
      outputRange: [0, 18, 32],
      extrapolate: 'clamp'
    });
    const opacity = dragX.interpolate({
      inputRange: [-120, -40, 0],
      outputRange: [1, 0.75, 0.45],
      extrapolate: 'clamp'
    });
    const scale = dragX.interpolate({
      inputRange: [-140, -60, 0],
      outputRange: [1.05, 1, 0.92],
      extrapolate: 'clamp'
    });

    return (
      <Pressable style={styles.swipeAction} onPress={() => handleRemoveItem(itemKey)}>
        <Animated.View style={[styles.swipeActionContent, { opacity, transform: [{ translateX }, { scale }] }]}>
          <Ionicons name="trash-outline" size={16} color="#FFF" />
          <Text style={styles.swipeActionText}>Eliminar</Text>
        </Animated.View>
      </Pressable>
    );
  };

  useEffect(() => {
    flushPendingOrders().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateSwipeHint = async () => {
      try {
        const seen = await AsyncStorage.getItem(SWIPE_HINT_SEEN_KEY);
        if (seen) {
          swipeHintPlayedRef.current = true;
        }
      } catch (_error) {
        // Ignore storage failures; fallback is showing hint once in current session.
      } finally {
        if (!cancelled) {
          setSwipeHintReady(true);
        }
      }
    };

    hydrateSwipeHint();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFocused || !swipeHintReady || swipeHintPlayedRef.current || cart.length === 0) return;

    const firstItem = cart[0];
    const firstKey = firstItem?.cartKey || firstItem?.ItemCode;
    if (!firstKey) return;

    const openTimer = setTimeout(() => {
      const row = swipeableRefs.current.get(firstKey);
      if (!row?.openRight || !row?.close) return;

      suppressSwipeDeleteRef.current = true;
      row.openRight();

      setTimeout(() => {
        row.close();
        suppressSwipeDeleteRef.current = false;
      }, 500);

      swipeHintPlayedRef.current = true;
      AsyncStorage.setItem(SWIPE_HINT_SEEN_KEY, '1').catch(() => {});
    }, 360);

    return () => clearTimeout(openTimer);
  }, [isFocused, swipeHintReady, cart]);

  const handleConfirmarPedido = async () => {
    if (cart.length === 0) {
      Alert.alert('Carrito Vacio', 'Debes agregar al menos un producto.');
      return;
    }

    const cardCodes = cartCardCodes;
    if (cardCodes.length > 1) {
      Alert.alert('Carrito invalido', 'El carrito contiene productos de distintos clientes. Limpia el carrito y vuelve a intentarlo.');
      return;
    }

    try {
      if (cardCodes.length > 0) {
        const { data, error } = await fetchCustomersForValidation(cardCodes);

        if (error) throw error;

        const blockedClient = (data || []).find((row) => String(row?.Bloqueado || '').trim().toUpperCase() === 'Y');
        if (blockedClient) {
          const blockedName = blockedClient.CardFName || blockedClient.CardName || blockedClient.CardCode;
          Alert.alert('Cliente bloqueado', `No puedes confirmar el pedido. ${blockedName} esta bloqueado.`);
          return;
        }
      }
    } catch (error) {
      const errorCode = classifyOrderError(error);
      if (errorCode === 'session_expired') {
        openSessionExpiredAlert('Tu sesion expiro. Debes iniciar sesion nuevamente.');
        return;
      }

      if (errorCode === 'network' || errorCode === 'timeout' || errorCode === 'server') {
        Alert.alert(
          'Validacion no disponible',
          'No se pudo validar el estado del cliente por conexion. Puedes continuar y el pedido se enviara cuando haya internet.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Continuar',
              onPress: () => {
                if (!deliveryDate) {
                  setDeliveryDate(formatDateToISO(getToday()));
                }
                setShowDatePicker(false);
                setCheckoutModalVisible(true);
              }
            }
          ]
        );
        return;
      }

      Alert.alert('Error', 'No se pudo validar el estado del cliente. Intenta nuevamente.');
      return;
    }

    if (!deliveryDate) {
      setDeliveryDate(formatDateToISO(getToday()));
    }
    setShowDatePicker(false);
    setCheckoutModalVisible(true);
  };

  const handleSubmitPedido = () => {
    const safeDate = String(deliveryDate || '').trim();
    if (!isValidDeliveryDate(safeDate)) {
      Alert.alert('Fecha invalida', 'Ingresa la fecha en formato YYYY-MM-DD.');
      return;
    }

    const warehouse = WAREHOUSE_OPTIONS.find((option) => option.code === selectedWarehouse);
    if (!warehouse) {
      Alert.alert('Almacen requerido', 'Selecciona un almacen de origen.');
      return;
    }

    const firstItem = cart?.[0] || {};
    const safeCardCode = String(firstItem.CardCode || '').trim();
    const uniqueCardCodes = Array.from(new Set(cart.map((item) => String(item?.CardCode || '').trim()).filter(Boolean)));
    if (uniqueCardCodes.length !== 1 || uniqueCardCodes[0] !== safeCardCode) {
      Alert.alert('Carrito invalido', 'Todos los productos del carrito deben pertenecer al mismo cliente.');
      return;
    }

    if (!safeCardCode) {
      Alert.alert('Datos incompletos', 'No se encontro CardCode en el carrito. Vuelve a seleccionar cliente.');
      return;
    }

    const linesPayload = buildOrderLinesPayload({ cart, warehouseCode: warehouse.code });

    if (!linesPayload.length || linesPayload.length !== cart.length) {
      Alert.alert('Lineas invalidas', 'Hay productos sin codigo o cantidad valida.');
      return;
    }

    const sendOrder = async () => {
      let queuedItem = null;
      try {
        setSubmittingOrder(true);
        let resolvedZona = String(firstItem.Zona || firstItem.zona || '').trim();
        let resolvedIdRuta = String(firstItem.IdRuta || firstItem.IDRuta || firstItem.idRuta || '').trim();

        if (!resolvedZona || !resolvedIdRuta) {
          const { data: customerMeta, error: customerMetaError } = await fetchCustomerRouteMeta(safeCardCode);

          if (!customerMetaError && customerMeta) {
            resolvedZona = resolvedZona || String(customerMeta.Zona || '').trim();
            resolvedIdRuta =
              resolvedIdRuta ||
              String(customerMeta.IDRuta || customerMeta.IdRuta || customerMeta.Ruta || '').trim();
          }
        }

        if (!resolvedZona || !resolvedIdRuta) {
          throw new Error(
            'Faltan datos del cliente para crear el pedido (Zona/IdRuta). Verifica el cliente en la tabla customers.'
          );
        }

        const rpcPayload = {
          p_client_order_id: buildClientOrderId(),
          p_card_code: safeCardCode,
          p_doc_due_date: safeDate,
          p_zona: resolvedZona,
          p_id_ruta: resolvedIdRuta,
          p_lines: linesPayload,
          p_comments: String(orderComments || '').trim() || null
        };
        queuedItem = await enqueuePendingOrder({
          rpcPayload,
          cardCode: safeCardCode,
          customerName: firstItem.CustomerName || firstItem.CardName || ''
        });

        const {
          data: { user },
          error: userError
        } = await fetchCurrentAuthUser();

        if (userError || !user?.id) {
          throw userError || { message: 'Usuario no autenticado', status: 401 };
        }

        const orderId = await submitSalesOrderRpc(rpcPayload);

        let sapDocNum = null;
        if (orderId) {
          for (let attempt = 0; attempt < SAP_DOCNUM_POLL_ATTEMPTS; attempt += 1) {
            const { data: createdOrder, error: orderReadError } = await fetchSalesOrderStatus(orderId);

            if (!orderReadError && createdOrder?.sap_docnum) {
              sapDocNum = String(createdOrder.sap_docnum).trim();
              break;
            }

            if (!orderReadError && createdOrder?.status === 'error') {
              break;
            }

            if (attempt < SAP_DOCNUM_POLL_ATTEMPTS - 1) {
              await wait(SAP_DOCNUM_POLL_DELAY_MS);
            }
          }
        }
        if (queuedItem?.id) {
          await removePendingOrder(queuedItem.id);
        }

        setCheckoutModalVisible(false);
        setShowDatePicker(false);
        setDeliveryDate('');
        setSelectedWarehouse('100');
        setOrderComments('');
        clearCart();
        const successMessage = sapDocNum
          ? `Pedido ${sapDocNum} guardado exitosamente. Puedes validar todos tus pedidos desde tu perfil.`
          : 'Pedido guardado exitosamente. SAP aun esta asignando el numero; revisa el estado en tu perfil.';
        Alert.alert('Exito', successMessage, [
          {
            text: 'OK',
            onPress: () => {
              router.replace({ pathname: '/(tabs)/clientes', params: { orderCompleted: String(Date.now()) } });
            }
          }
        ]);
      } catch (error) {
        console.error('create_sales_order rpc failed', error);
        const errorCode = classifyOrderError(error);
        const userMessage = getOrderErrorMessage(error);
        const shouldKeepQueued = shouldKeepOrderInQueue(errorCode);

        if (queuedItem?.id) {
          if (shouldKeepQueued) {
            await markPendingOrderError(queuedItem.id, error);
          } else {
            await removePendingOrder(queuedItem.id);
          }
        }

        if (errorCode === 'session_expired') {
          openSessionExpiredAlert(`${userMessage} Tu pedido quedo guardado localmente y se enviara cuando vuelvas a iniciar sesion.`);
          return;
        }

        if (shouldKeepQueued) {
          setCheckoutModalVisible(false);
          setShowDatePicker(false);
          setDeliveryDate('');
          setSelectedWarehouse('100');
          setOrderComments('');
          clearCart();
          Alert.alert('Pedido pendiente', `${userMessage} Puedes validar su estado desde tu perfil.`);
          router.replace('/(tabs)/clientes');
          return;
        }

        Alert.alert('Error al enviar', userMessage);
      } finally {
        setSubmittingOrder(false);
      }
    };

    const confirmMessage = `Deseas enviar este pedido por un total de $${getTotal().toFixed(2)}?\nFecha: ${safeDate}\nAlmacen: ${warehouse.code} - ${warehouse.name}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        sendOrder();
      }
      return;
    }

    Alert.alert('Confirmar Pedido', confirmMessage, [
      { text: 'Cancelar', style: 'cancel' },
      {
        style: 'destructive',
        text: 'Enviar',
        onPress: sendOrder
      }
    ]);
  };

  const handleDateChange = (event, selectedDate) => {
    if (event?.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }

    if (!selectedDate) return;

    const normalized = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    setDeliveryDate(formatDateToISO(normalized));
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      setShowDatePicker(false);
    }
  };

  const handleOpenDatePicker = () => {
    const currentDate = parseISODate(deliveryDate) || getToday();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        minimumDate: getToday(),
        onChange: handleDateChange
      });
      return;
    }

    setShowDatePicker((prev) => !prev);
  };
  const minDeliveryDateIso = useMemo(() => formatDateToISO(getToday()), []);

  const handleClearCartPress = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Borrar todo el carrito?');
      if (confirmed) clearCart();
      return;
    }

    Alert.alert('Vaciar', 'Borrar todo el carrito?', [
      { text: 'No' },
      { text: 'Si', onPress: clearCart }
    ]);
  };

  const handleSharePressIn = () => {
    Animated.spring(sharePressAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0
    }).start();
  };

  const handleSharePressOut = () => {
    Animated.spring(sharePressAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6
    }).start();
  };

  const renderItem = ({ item }) => {
    const itemKey = item.cartKey || item.ItemCode;
    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(itemKey, ref);
          else swipeableRefs.current.delete(itemKey);
        }}
        overshootRight={false}
        rightThreshold={56}
        friction={1.9}
        onSwipeableOpen={(direction) => {
          if (suppressSwipeDeleteRef.current) return;
          if (direction === 'right') {
            handleRemoveItem(itemKey);
          }
        }}
        renderRightActions={(_progress, dragX) => renderSwipeRightAction(dragX, itemKey)}
      >
        <Card style={[styles.cartItem, GLOBAL_STYLES.shadow]} mode="contained">
          <Card.Content style={styles.itemContent}>
            <View style={styles.itemThumbWrap}>
              <Image source={{ uri: resolveCartImageUrl(item) }} contentFit="cover" transition={120} style={styles.itemThumbImage} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.ItemName}</Text>
              <Text style={styles.itemPrice}>Unitario: ${parseFloat(item.Price).toFixed(2)}</Text>
              <Text style={styles.itemSubtotal}>Subtotal: ${(item.Price * item.quantity).toFixed(2)}</Text>
            </View>

            <View style={styles.quantityControls}>
              <IconButton
                icon="minus"
                size={18}
                style={styles.iconBtn}
                onPress={() => {
                  removeFromCart(itemKey);
                  setQuantityDrafts((prev) => ({ ...prev, [itemKey]: formatQuantity(Math.max(0, item.quantity - 1)) }));
                }}
              />
              <TextInput
                value={quantityDrafts[itemKey] ?? formatQuantity(item.quantity)}
                onChangeText={(value) =>
                  setQuantityDrafts((prev) => ({
                    ...prev,
                    [itemKey]: sanitizeQuantityInput(value)
                  }))
                }
                onBlur={() => commitDraftQuantity(itemKey, item.quantity)}
                keyboardType="decimal-pad"
                style={styles.quantityInput}
                maxLength={8}
              />
              <IconButton
                icon="plus"
                size={18}
                style={styles.iconBtn}
                onPress={() => {
                  addToCart({ ...item, quantity: 1 });
                  setQuantityDrafts((prev) => ({ ...prev, [itemKey]: formatQuantity(item.quantity + 1) }));
                }}
              />
            </View>
          </Card.Content>
        </Card>
      </Swipeable>
    );
  };

  const handleShareCartPdf = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert('Carrito vacio', 'No hay productos para compartir.');
      return;
    }

    try {
      setSharingPdf(true);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }

      const createdAt = new Date().toLocaleString('es-PA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const placeholder = 'https://uploadimage.pedersenfinefoods.com/noimage-placeholder2.png';
      const logoUrl = 'https://uploadimage.pedersenfinefoods.com/mainlogo.png';
      const safeCustomer = `${orderCustomerName || 'Sin nombre'}${orderCustomerCode ? ` (${orderCustomerCode})` : ''}`;
      const orderTotal = Number(getTotal() || 0);

      const rowsHtml = cart
        .map((item) => {
          const code = escapeHtml(item?.ItemCode || '');
          const name = escapeHtml(item?.ItemName || '');
          const uom = escapeHtml(String(item?.UOM || item?.uom || '').trim());
          const qty = Number(item?.quantity || 0);
          const price = Number(item?.Price || 0);
          const subtotal = qty * price;
          const rawImageUrl = resolveCartImageUrl(item);
          const imageUrl = escapeHtml(String(rawImageUrl || '').trim() || placeholder);

          return `
            <tr class="row-item">
              <td style="padding:6px; vertical-align:middle;">
                <div style="font-weight:700; line-height:1.2;">${name}</div>
                <div style="font-size:10px; color:#666; margin-top:2px;">Item: ${code}</div>
              </td>
              <td class="text-center"><img src="${imageUrl}" class="img-thumb" width="58" height="58" /></td>
              <td class="text-center">${qty}${uom ? ` ${uom}` : ''}</td>
              <td class="text-right">$ ${price.toFixed(2)}</td>
              <td class="text-right">$ ${subtotal.toFixed(2)}</td>
            </tr>
          `;
        })
        .join('');

      const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { --brand:#0b4b88; }
    body { font-family: Arial, sans-serif; font-size:12px; color:#333; margin:0; padding:0; }
    .main-table { width:100%; border-collapse:collapse; }
    thead { display: table-header-group; }
    .header-container { border-bottom:3px solid var(--brand); padding-bottom:10px; margin-bottom:14px; width:100%; }
    .header-flex { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .header-info { width:66%; }
    .header-logo { width:30%; text-align:right; }
    .logo { max-width:150px; max-height:58px; }
    .title { font-size:18px; font-weight:700; color:var(--brand); margin-bottom:6px; }
    .data-box { border:1px solid #ddd; border-radius:4px; padding:8px; line-height:1.45; font-size:11px; }
    .items-table { width:100%; border-collapse:collapse; margin-top:8px; }
    .items-table th { background:var(--brand); color:#fff; padding:8px; text-align:left; font-size:11px; }
    .items-table td { border:1px solid #eee; padding:6px; }
    .row-item { page-break-inside: avoid !important; break-inside: avoid !important; }
    .totals-wrapper { width:100%; margin-top:14px; page-break-inside:avoid; }
    .totals-table { width:35%; float:right; border-collapse:collapse; }
    .totals-table td { padding:4px 8px; background:#f9f9f9; border-bottom:1px solid #eee; }
    .totals-table tr:last-child td { border-top:2px solid var(--brand); font-weight:700; background:#f0f6fb; color:var(--brand); }
    .footer-note { text-align:center; color:#dd052b; margin-top:22px; font-size:11px; border-top:1px solid #eee; padding-top:10px; page-break-inside:avoid; }
    .img-thumb { object-fit:contain; display:block; margin:0 auto; border-radius:6px; }
    .text-right { text-align:right; }
    .text-center { text-align:center; }
    .footer { position:fixed; bottom:0; width:100%; padding:10px 0; background:#fff; border-top:1px solid #eee; }
    .footer-address { font-size:9px; color:#888; text-align:center; }
    @page { margin:15mm 15mm 25mm 15mm; }
  </style>
</head>
<body>
  <table class="main-table">
    <thead>
      <tr>
        <td>
          <div class="header-container">
            <div class="header-flex">
              <div class="header-info">
                <div class="title">RESUMEN DE PEDIDO</div>
                <div class="data-box">
                  <div><strong>Cliente:</strong> ${escapeHtml(safeCustomer)}</div>
                  <div><strong>Fecha:</strong> ${escapeHtml(createdAt)}</div>
                  <div><strong>Lineas:</strong> ${cart.length}</div>
                </div>
              </div>
              <div class="header-logo">
                <img src="${escapeHtml(logoUrl)}" class="logo" />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <table class="items-table">
            <thead>
              <tr>
                <th style="width:45%;">Producto</th>
                <th class="text-center">Foto</th>
                <th class="text-center">Cant.</th>
                <th class="text-right">Precio</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="totals-wrapper">
            <table class="totals-table">
              <tr><td>Subtotal:</td><td class="text-right">$ ${orderTotal.toFixed(2)}</td></tr>
              <tr><td>Total:</td><td class="text-right">$ ${orderTotal.toFixed(2)}</td></tr>
            </table>
          </div>
          <div style="clear:both;"></div>
          <div class="footer-note"><strong>Nota: Cotizacion valida por 7 dias calendario.</strong></div>
        </td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <div class="footer-address">Ave. Cincuentenario, Edificio Pedersen Fine Foods, Ciudad de Panama</div>
  </div>
</body>
</html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartir carrito en PDF',
        UTI: 'com.adobe.pdf'
      });
    } catch (error) {
      Alert.alert('Error', error?.message || 'No se pudo compartir el carrito en PDF.');
    } finally {
      setSharingPdf(false);
    }
  }, [cart, orderCustomerCode, orderCustomerName, getTotal]);
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: COLORS.background, height: APP_LAYOUT.HEADER_HEIGHT }
    }),
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Stack.Screen options={screenOptions} />

      {cart.length === 0 ? (
        <LinearGradient colors={['#0A2952', '#0E3D75', '#1664A0']} style={styles.emptyWrap}>
          <View style={styles.emptyPanel}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cart-outline" size={30} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Tu carrito esta vacio</Text>
            <Text style={styles.emptyText}>Agrega productos del catalogo para crear un pedido y calcular el total automaticamente.</Text>
            <Button mode="contained" buttonColor={COLORS.primary} style={styles.emptyButton} onPress={() => router.push('/catalogo')}>
              IR AL CATALOGO
            </Button>
          </View>
        </LinearGradient>
      ) : (
        <>
          <LinearGradient colors={['#0F3C73', '#165A97']} style={[styles.topPanel, GLOBAL_STYLES.shadow]}>
            <View style={styles.topPanelRow}>
              <View style={styles.topPanelBadge}>
                <Ionicons name="receipt-outline" size={16} color="#FFF" />
              </View>
              <View style={styles.topPanelTextWrap}>
                <Text style={styles.topPanelLabel}>Pedido activo</Text>
                <Text style={styles.topPanelValue} numberOfLines={1}>
                  {orderCustomerName || 'Cliente sin nombre'}
                  {orderCustomerCode ? ` (${orderCustomerCode})` : ''}
                </Text>
              </View>
              <View style={styles.topPanelActions}>
                <Text style={styles.topPanelTotal}>${getTotal().toFixed(2)}</Text>
                <Pressable
                  onPress={handleShareCartPdf}
                  onPressIn={handleSharePressIn}
                  onPressOut={handleSharePressOut}
                  disabled={sharingPdf}
                  style={styles.topPanelShareBtn}
                >
                  <Animated.View style={{ transform: [{ scale: sharePressAnim }] }}>
                    <Ionicons name="share-outline" size={18} color="#FFF" />
                  </Animated.View>
                </Pressable>
              </View>
            </View>
            {hasMixedClients && (
              <View style={styles.topPanelWarning}>
                <Ionicons name="warning-outline" size={14} color="#FFD9DE" />
                <Text style={styles.topPanelWarningText}>Carrito invalido: hay productos de distintos clientes.</Text>
              </View>
            )}
          </LinearGradient>

          {hasMixedClients && (
            <View style={styles.mixedClientAlert}>
              <Text style={styles.mixedClientAlertText}>Confirma un solo cliente para enviar el pedido.</Text>
            </View>
          )}

          <FlatList
            data={cart}
            keyExtractor={(item) => item.cartKey || `${item.CardCode || 'na'}::${item.ItemCode || 'item'}`}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL PEDIDO:</Text>
              <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
            </View>

            <View style={styles.actionButtons}>
              <Button
                mode="text"
                textColor={COLORS.secondary}
                style={styles.btnCancel}
                onPress={handleClearCartPress}
              >
                VACIAR
              </Button>
              <Button
                mode="contained"
                buttonColor={COLORS.primary}
                style={styles.btnConfirm}
                disabled={hasMixedClients}
                onPress={handleConfirmarPedido}
              >
                CONFIRMAR
              </Button>
            </View>
          </View>
        </>
      )}

      <Modal
        visible={checkoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCheckoutModalVisible(false);
          setShowDatePicker(false);
        }}
      >
        <Pressable
          style={styles.checkoutBackdrop}
          onPress={() => {
            setCheckoutModalVisible(false);
            setShowDatePicker(false);
          }}
        >
          <CheckoutKeyboardContainer
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            style={styles.checkoutKeyboardWrap}
          >
            <View style={styles.checkoutKeyboardContent}>
              <Pressable style={styles.checkoutPanel} onPress={(event) => event.stopPropagation()}>
                <ScrollView
                  ref={checkoutScrollRef}
                  style={styles.checkoutScroll}
                  contentContainerStyle={styles.checkoutScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.checkoutTitle}>Datos de entrega</Text>
                  <Text style={styles.checkoutLabel}>Fecha de entrega</Text>
                  {Platform.OS === 'web' ? (
                    <View style={styles.webDateInputWrap}>
                      <input
                        type="date"
                        min={minDeliveryDateIso}
                        value={deliveryDate || minDeliveryDateIso}
                        onChange={(event) => setDeliveryDate(String(event?.target?.value || ''))}
                        style={{
                          width: '100%',
                          height: 30,
                          border: 'none',
                          outline: 'none',
                          fontSize: 15,
                          fontWeight: 700,
                          color: COLORS.text,
                          backgroundColor: '#FFF'
                        }}
                      />
                    </View>
                  ) : (
                    <Pressable style={styles.checkoutDateButton} onPress={handleOpenDatePicker}>
                      <View style={styles.checkoutDateButtonContent}>
                        <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                        <Text style={deliveryDate ? styles.checkoutDateValue : styles.checkoutDatePlaceholder}>
                          {deliveryDate || minDeliveryDateIso}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  <Text style={styles.checkoutDateHint}>{formatDateForDisplay(deliveryDate || minDeliveryDateIso)}</Text>
                  {Platform.OS !== 'android' && showDatePicker && (
                    <View style={Platform.OS === 'ios' ? styles.iosDatePickerWrap : undefined}>
                      <DateTimePicker
                        value={parseISODate(deliveryDate) || getToday()}
                        mode="date"
                        minimumDate={getToday()}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
                        accentColor={Platform.OS === 'ios' ? COLORS.primary : undefined}
                        style={Platform.OS === 'ios' ? styles.iosDatePicker : undefined}
                        onChange={handleDateChange}
                      />
                    </View>
                  )}

                  <Text style={styles.checkoutLabel}>Almacen de origen</Text>
                  <View style={styles.warehouseList}>
                    {WAREHOUSE_OPTIONS.map((option) => {
                      const isActive = selectedWarehouse === option.code;
                      return (
                        <Pressable
                          key={option.code}
                          onPress={() => setSelectedWarehouse(option.code)}
                          style={[styles.warehouseOption, isActive && styles.warehouseOptionActive]}
                        >
                          <Text style={[styles.warehouseOptionCode, isActive && styles.warehouseOptionCodeActive]}>{option.code}</Text>
                          <Text style={[styles.warehouseOptionName, isActive && styles.warehouseOptionNameActive]}>{option.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.checkoutLabel}>Comentarios (opcional)</Text>
                  <TextInput
                    value={orderComments}
                    onChangeText={setOrderComments}
                    placeholder="Escribe aqui observaciones del pedido..."
                    multiline
                    numberOfLines={3}
                    maxLength={250}
                    style={styles.checkoutCommentsInput}
                    onFocus={() => {
                      setTimeout(() => {
                        checkoutScrollRef.current?.scrollToEnd?.({ animated: true });
                      }, 120);
                    }}
                  />
                  <Text style={styles.checkoutCommentCounter}>{`${String(orderComments || '').length}/250`}</Text>

                  <View style={styles.checkoutActions}>
                    <Button
                      mode="text"
                      textColor={COLORS.textLight}
                      disabled={submittingOrder}
                      onPress={() => {
                        setCheckoutModalVisible(false);
                        setShowDatePicker(false);
                      }}
                    >
                      CANCELAR
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor={COLORS.primary}
                      onPress={handleSubmitPedido}
                      loading={submittingOrder}
                      disabled={submittingOrder}
                    >
                      ENVIAR
                    </Button>
                  </View>
                </ScrollView>
              </Pressable>
            </View>
          </CheckoutKeyboardContainer>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 15, paddingTop: 12 },
  topPanel: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  topPanelRow: { flexDirection: 'row', alignItems: 'center' },
  topPanelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  topPanelTextWrap: { flex: 1, marginLeft: 10, marginRight: 8 },
  topPanelLabel: { color: '#D9EBFF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  topPanelValue: { marginTop: 2, color: '#FFF', fontSize: 13, fontWeight: '800' },
  topPanelActions: { alignItems: 'flex-end' },
  topPanelTotal: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  topPanelShareBtn: {
    marginTop: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  topPanelWarning: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  topPanelWarningText: {
    color: '#FFD9DE',
    fontSize: 12,
    fontWeight: '700'
  },
  mixedClientAlert: {
    marginHorizontal: 15,
    marginTop: 8,
    marginBottom: 2
  },
  mixedClientAlertText: { color: '#B00020', fontSize: 12, fontWeight: '700' },
  cartItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 10
  },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemThumbWrap: {
    width: 58,
    height: 58,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: '#E4ECF6',
    marginRight: 10
  },
  itemThumbImage: {
    width: '100%',
    height: '100%'
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  itemPrice: { fontSize: 12, color: COLORS.textLight },
  itemSubtotal: { fontSize: 13, fontWeight: 'bold', color: COLORS.secondary, marginTop: 4 },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 2
  },
  iconBtn: { margin: 0 },
  swipeAction: {
    width: 112,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden'
  },
  swipeActionContent: {
    flex: 1,
    backgroundColor: '#D64545',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4
  },
  swipeActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700'
  },
  quantityInput: {
    minWidth: 72,
    height: 40,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    backgroundColor: '#FFF',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 8,
    paddingVertical: 0
  },
  footer: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  totalValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btnCancel: { flex: 1 },
  btnConfirm: { flex: 2, borderRadius: 8 },
  checkoutBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  checkoutKeyboardWrap: {
    flex: 1,
    width: '100%'
  },
  checkoutKeyboardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  checkoutPanel: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    maxHeight: '88%'
  },
  checkoutScroll: { width: '100%' },
  checkoutScrollContent: { paddingBottom: 4 },
  checkoutTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginBottom: 10 },
  checkoutLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6, marginTop: 6 },
  checkoutDateButton: {
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFF'
  },
  checkoutDateButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webDateInputWrap: {
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFF'
  },
  checkoutDateValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  checkoutDatePlaceholder: { fontSize: 15, color: COLORS.textLight },
  checkoutDateHint: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
  iosDatePickerWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFF'
  },
  iosDatePicker: {
    backgroundColor: '#FFF',
    width: '100%',
    height: 160
  },
  checkoutCommentsInput: {
    marginTop: 2,
    minHeight: 86,
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    color: COLORS.text
  },
  checkoutCommentCounter: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'right'
  },
  warehouseList: { gap: 8, marginTop: 4 },
  warehouseOption: {
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  warehouseOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EAF1FA'
  },
  warehouseOptionCode: { fontSize: 14, fontWeight: '800', color: COLORS.textLight },
  warehouseOptionCodeActive: { color: COLORS.primary },
  warehouseOptionName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  warehouseOptionNameActive: { color: COLORS.primary },
  checkoutActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyPanel: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: '#FFF',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EAF1FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  emptyTitle: { fontSize: 22, color: COLORS.primary, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textLight, marginTop: 10, textAlign: 'center', lineHeight: 21 },
  emptyButton: { marginTop: 20, borderRadius: 10, width: '100%' }
});
