import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Button, Card, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalSupabaseSession, supabase } from '../../src/services/supabaseClient';
import { enqueuePendingOrder, flushPendingOrders } from '../../src/services/offlineService';
import { useCart } from '../../src/context/CartContext';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';

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
const formatDateToISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const parseISODate = (value) => {
  const trimmed = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
};
const formatDateForDisplay = (value) => {
  const parsed = parseISODate(value);
  if (!parsed) return 'Sin fecha seleccionada';
  return parsed.toLocaleDateString('es-PA', { year: 'numeric', month: 'long', day: '2-digit' });
};
const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};
const resolveCartImageUrl = (item) => {
  const rawUrl = item?.Url ?? item?.url ?? item?.image_url;
  const safeUrl = String(rawUrl || '').trim();
  return safeUrl || PRODUCT_FALLBACK_IMAGE;
};

export default function Pedido() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { cart, addToCart, removeFromCart, updateCartItemQuantity, clearCart, getTotal } = useCart();
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('100');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [swipeHintReady, setSwipeHintReady] = useState(false);
  const swipeableRefs = useRef(new Map());
  const swipeHintPlayedRef = useRef(false);
  const suppressSwipeDeleteRef = useRef(false);
  const cartCardCodes = useMemo(
    () => Array.from(new Set(cart.map((item) => String(item?.CardCode || '').trim()).filter(Boolean))),
    [cart]
  );
  const hasMixedClients = cartCardCodes.length > 1;
  const orderCustomerCode = cartCardCodes[0] || '';
  const orderCustomerName = String(cart?.[0]?.CustomerName || cart?.[0]?.CardName || '').trim();
  const screenOptions = useMemo(() => ({ title: 'Resumen de Pedido' }), []);
  const openSessionExpiredAlert = () => {
    setCheckoutModalVisible(false);
    setShowDatePicker(false);
    Alert.alert('Sesion expirada', 'Tu sesion expiro. Debes iniciar sesion nuevamente.', [
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
        const { data, error } = await supabase
          .from('customers')
          .select('CardCode, CardName, CardFName, Bloqueado')
          .in('CardCode', cardCodes);

        if (error) throw error;

        const blockedClient = (data || []).find((row) => String(row?.Bloqueado || '').trim().toUpperCase() === 'Y');
        if (blockedClient) {
          const blockedName = blockedClient.CardFName || blockedClient.CardName || blockedClient.CardCode;
          Alert.alert('Cliente bloqueado', `No puedes confirmar el pedido. ${blockedName} esta bloqueado.`);
          return;
        }
      }
    } catch (_error) {
      Alert.alert('Error', 'No se pudo validar el estado del cliente. Intenta nuevamente.');
      return;
    }

    if (!deliveryDate) {
      setDeliveryDate(formatDateToISO(getToday()));
    }
    setCheckoutModalVisible(true);
  };

  const isValidDeliveryDate = (value) => {
    const trimmed = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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

    const linesPayload = cart
      .map((item) => ({
        ItemCode: String(item?.ItemCode || '').trim(),
        Quantity: Number(item?.quantity),
        WarehouseCode: warehouse.code
      }))
      .filter((line) => line.ItemCode && Number.isFinite(line.Quantity) && line.Quantity > 0);

    if (!linesPayload.length || linesPayload.length !== cart.length) {
      Alert.alert('Lineas invalidas', 'Hay productos sin codigo o cantidad valida.');
      return;
    }

    const sendOrder = async () => {
      let queuedPayload = null;
      try {
        setSubmittingOrder(true);
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError) {
          openSessionExpiredAlert();
          return;
        }
        if (!user?.id) {
          openSessionExpiredAlert();
          return;
        }

        let resolvedZona = String(firstItem.Zona || firstItem.zona || '').trim();
        let resolvedIdRuta = String(firstItem.IdRuta || firstItem.IDRuta || firstItem.idRuta || '').trim();

        if (!resolvedZona || !resolvedIdRuta) {
          const { data: customerMeta, error: customerMetaError } = await supabase
            .from('customers')
            .select('Zona, IDRuta, Ruta')
            .eq('CardCode', safeCardCode)
            .single();

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
          p_card_code: safeCardCode,
          p_doc_due_date: safeDate,
          p_zona: resolvedZona,
          p_id_ruta: resolvedIdRuta,
          p_lines: linesPayload
        };
        queuedPayload = rpcPayload;
        const { data: orderId, error } = await supabase.rpc('create_sales_order', {
          ...rpcPayload
        });

        if (error) throw error;

        let sapDocNum = null;
        if (orderId) {
          for (let attempt = 0; attempt < SAP_DOCNUM_POLL_ATTEMPTS; attempt += 1) {
            const { data: createdOrder, error: orderReadError } = await supabase
              .from('sales_orders')
              .select('sap_docnum, status')
              .eq('id', orderId)
              .maybeSingle();

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

        setCheckoutModalVisible(false);
        setShowDatePicker(false);
        setDeliveryDate('');
        setSelectedWarehouse('100');
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
        const rawErrorText = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        const isNetworkError =
          rawErrorText.includes('network request failed') ||
          rawErrorText.includes('failed to fetch') ||
          rawErrorText.includes('timeout') ||
          rawErrorText.includes('offline') ||
          rawErrorText.includes('network');
        const isSessionExpired =
          rawErrorText.includes('auth session missing') ||
          rawErrorText.includes('usuario no autenticado') ||
          rawErrorText.includes('jwt') ||
          rawErrorText.includes('not authenticated') ||
          error?.status === 401 ||
          error?.code === 'PGRST301';

        if (isSessionExpired) {
          openSessionExpiredAlert();
          return;
        }

        if (isNetworkError && queuedPayload) {
          await enqueuePendingOrder({
            rpcPayload: queuedPayload,
            cardCode: safeCardCode,
            customerName: firstItem.CustomerName || firstItem.CardName || ''
          });
          setCheckoutModalVisible(false);
          setShowDatePicker(false);
          setDeliveryDate('');
          setSelectedWarehouse('100');
          clearCart();
          Alert.alert('Sin conexion', 'Tu pedido se guardo en cola y se enviara automaticamente cuando vuelva la conexion.');
          router.replace('/(tabs)/clientes');
          return;
        }

        const detailParts = [
          error?.message,
          error?.details,
          error?.hint,
          error?.code ? `Code: ${error.code}` : ''
        ]
          .map((part) => String(part || '').trim())
          .filter(Boolean);
        const message = detailParts.join('\n') || 'No se pudo crear el pedido.';
        Alert.alert('Error al enviar', message);
      } finally {
        setSubmittingOrder(false);
      }
    };

    Alert.alert(
      'Confirmar Pedido',
      `Deseas enviar este pedido por un total de $${getTotal().toFixed(2)}?\nFecha: ${safeDate}\nAlmacen: ${warehouse.code} - ${warehouse.name}`,
      [
      { text: 'Cancelar', style: 'cancel' },
      {
        style: 'destructive',
        text: 'Enviar',
        onPress: sendOrder
      }
      ]
    );
  };

  const handleDateChange = (event, selectedDate) => {
    if (event?.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }

    if (!selectedDate) return;

    const normalized = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    setDeliveryDate(formatDateToISO(normalized));
    if (Platform.OS === 'android') {
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

    setShowDatePicker(true);
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
          <View style={[styles.orderTargetCard, hasMixedClients && styles.orderTargetCardError]}>
            <View style={styles.orderTargetIconWrap}>
              <Ionicons
                name={hasMixedClients ? 'warning-outline' : 'business-outline'}
                size={16}
                color={hasMixedClients ? '#B00020' : COLORS.primary}
              />
            </View>
            <View style={styles.orderTargetTextWrap}>
              <Text style={[styles.orderTargetLabel, hasMixedClients && styles.orderTargetLabelError]}>
                {hasMixedClients ? 'Carrito invalido' : 'Pedido para'}
              </Text>
              <Text style={[styles.orderTargetValue, hasMixedClients && styles.orderTargetValueError]}>
                {hasMixedClients
                  ? 'Hay productos de distintos clientes.'
                  : `${orderCustomerName || 'Cliente sin nombre'}${orderCustomerCode ? ` (${orderCustomerCode})` : ''}`}
              </Text>
            </View>
          </View>

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
                onPress={() => {
                  Alert.alert('Vaciar', 'Borrar todo el carrito?', [
                    { text: 'No' },
                    { text: 'Si', onPress: clearCart }
                  ]);
                }}
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
          <Pressable style={styles.checkoutPanel} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.checkoutTitle}>Datos de entrega</Text>
            <Text style={styles.checkoutLabel}>Fecha de entrega</Text>
            <Pressable style={styles.checkoutDateButton} onPress={handleOpenDatePicker}>
              <View style={styles.checkoutDateButtonContent}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                <Text style={deliveryDate ? styles.checkoutDateValue : styles.checkoutDatePlaceholder}>
                  {deliveryDate || formatDateToISO(getToday())}
                </Text>
              </View>
            </Pressable>
            <Text style={styles.checkoutDateHint}>{formatDateForDisplay(deliveryDate || formatDateToISO(getToday()))}</Text>
            {Platform.OS === 'ios' && showDatePicker && (
              <DateTimePicker
                value={parseISODate(deliveryDate) || getToday()}
                mode="date"
                minimumDate={getToday()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
              />
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
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 15 },
  orderTargetCard: {
    marginHorizontal: 15,
    marginTop: 12,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#DDE7F4',
    borderRadius: 12,
    backgroundColor: '#F7FBFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center'
  },
  orderTargetCardError: {
    borderColor: '#F3C5CE',
    backgroundColor: '#FFF3F5'
  },
  orderTargetIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orderTargetTextWrap: { marginLeft: 8, flex: 1 },
  orderTargetLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase' },
  orderTargetLabelError: { color: '#B00020' },
  orderTargetValue: { marginTop: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  orderTargetValueError: { color: '#B00020' },
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  checkoutPanel: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16
  },
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
  checkoutDateValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  checkoutDatePlaceholder: { fontSize: 15, color: COLORS.textLight },
  checkoutDateHint: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
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
