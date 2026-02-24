import { supabase } from '../../../shared/infrastructure/supabaseClient';

const CUSTOMER_SELECT_FIELDS =
  'CardCode, CardName, CardFName, RUC, DV, Vendedor, Nivel, SubCategoria, TipoCadena, Ruta, Zona, IDRuta, Direccion, DiasEntrega, Horario, Balance, Bloqueado, Correo';

const buildCustomersQuery = ({ from, to, searchTerm = '' }) => {
  let query = supabase
    .from('customers')
    .select(CUSTOMER_SELECT_FIELDS)
    .not('Nivel', 'ilike', 'EMPLEADOS')
    .order('CardName', { ascending: true })
    .order('CardCode', { ascending: true })
    .order('Nivel', { ascending: true })
    .range(from, to);

  if (searchTerm) {
    const likeTerm = `%${searchTerm}%`;
    query = query.or(`CardName.ilike.${likeTerm},CardFName.ilike.${likeTerm},CardCode.ilike.${likeTerm},RUC.ilike.${likeTerm}`);
  }

  return query;
};

export const fetchAuthUser = async () => supabase.auth.getUser();

export const fetchProfileById = async (userId) =>
  supabase.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();

export const fetchCustomersPage = async ({ from, to, searchTerm = '' }) =>
  buildCustomersQuery({ from, to, searchTerm });

export const subscribeCustomersRealtime = ({ role, onCustomerUpdated, onStatusChanged }) =>
  supabase
    .channel(`customers-realtime-${role}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'customers'
      },
      onCustomerUpdated
    )
    .subscribe(onStatusChanged);

export const removeCustomersRealtimeChannel = async (channel) => supabase.removeChannel(channel);

export { CUSTOMER_SELECT_FIELDS };
