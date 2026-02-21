export const normalizeLineNumber = (row, index) =>
  String(row?.line_num || row?.LineNum || row?.line_id || row?.id || index + 1);

export const normalizeItemCode = (value) => String(value || '').trim().toUpperCase();

export const normalizeOrderLine = (row, index) => {
  const quantity = Number(row?.quantity ?? row?.Quantity ?? row?.qty ?? 0);
  const unitPrice = Number(row?.unit_price ?? row?.UnitPrice ?? row?.price ?? row?.Price ?? 0);
  const sourceLineTotal = Number(row?.line_total ?? row?.LineTotal ?? row?.total ?? row?.Total ?? NaN);
  const lineTotal = Number.isFinite(sourceLineTotal)
    ? sourceLineTotal
    : (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);

  return {
    id: normalizeLineNumber(row, index),
    itemCode: String(row?.item_code || row?.ItemCode || '').trim(),
    itemName: String(row?.item_name || row?.ItemName || '').trim(),
    uom: String(row?.uom || row?.UOM || '').trim(),
    warehouseCode: String(row?.warehouse_code || row?.WarehouseCode || row?.whs_code || '').trim(),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0
  };
};

export const mapProductNameFromRow = (row) => {
  const code = String(row?.ItemCode || row?.item_code || row?.itemcode || '').trim();
  const name = String(row?.ItemName || row?.item_name || row?.itemname || '').trim();
  return { code, name };
};
