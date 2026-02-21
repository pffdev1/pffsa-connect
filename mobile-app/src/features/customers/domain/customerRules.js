export const sanitizeSearchTerm = (value = '') =>
  value
    .trim()
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ');

export const normalizeSellerName = (value = '') =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const deriveProfileName = (profileRow, authUser) => {
  const profileFullName = String(profileRow?.full_name || '').trim();
  if (profileFullName) return profileFullName;

  const metadataFullName = String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '').trim();
  if (metadataFullName) return metadataFullName;

  return '';
};

export const matchesSearchTerm = (item, normalizedTerm) => {
  if (!normalizedTerm) return true;
  return [item?.CardName, item?.CardCode, item?.CardFName, item?.RUC].some((value) =>
    normalizeSellerName(String(value || '')).includes(normalizedTerm)
  );
};

export const isClientBlocked = (item) => normalizeSellerName(String(item?.Bloqueado || '')) === 'Y';
