export const buildClientOrderId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const buildOrderLinesPayload = ({ cart = [], warehouseCode = '' }) =>
  cart
    .map((item) => ({
      ItemCode: String(item?.ItemCode || '').trim(),
      Quantity: Number(item?.quantity),
      WarehouseCode: String(warehouseCode || '').trim(),
      UnitPrice: Number(item?.Price),
      Price: Number(item?.Price)
    }))
    .filter((line) => line.ItemCode && Number.isFinite(line.Quantity) && line.Quantity > 0);
