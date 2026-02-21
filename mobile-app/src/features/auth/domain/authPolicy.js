export const ALLOWED_ROLES = new Set(['admin', 'vendedor']);

export const resolveProfileAccess = (profileRow) => {
  const role = String(profileRow?.role || '').trim().toLowerCase();
  const statusRaw = String(profileRow?.status ?? '').trim().toLowerCase();
  const activeRaw = profileRow?.active;
  const isActiveByBoolean = typeof activeRaw === 'boolean' ? activeRaw : null;
  const isActiveByStatus =
    statusRaw === ''
      ? null
      : statusRaw === 'active' || statusRaw === 'enabled' || statusRaw === '1' || statusRaw === 'true';
  const isActive = isActiveByBoolean ?? isActiveByStatus ?? true;
  return { role, isActive };
};

export const assertProfileAccess = (profileRow) => {
  if (!profileRow) {
    const error = new Error('NO_PROFILE');
    error.code = 'NO_PROFILE';
    throw error;
  }

  const { role, isActive } = resolveProfileAccess(profileRow);
  if (!isActive) {
    const error = new Error('ACCOUNT_DISABLED');
    error.code = 'ACCOUNT_DISABLED';
    throw error;
  }
  if (!ALLOWED_ROLES.has(role)) {
    const error = new Error('ROLE_NOT_ALLOWED');
    error.code = 'ROLE_NOT_ALLOWED';
    throw error;
  }
  return { role, profile: profileRow };
};
