import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const fetchCustomersForValidation = async (cardCodes = []) =>
  supabase.from('customers').select('CardCode, CardName, CardFName, Bloqueado').in('CardCode', cardCodes);

export const fetchCustomerRouteMeta = async (cardCode) =>
  supabase.from('customers').select('Zona, IDRuta, Ruta').eq('CardCode', cardCode).single();

export const fetchCurrentAuthUser = async () => supabase.auth.getUser();

export const fetchSalesOrderStatus = async (orderId) =>
  supabase.from('sales_orders').select('sap_docnum, status').eq('id', orderId).maybeSingle();
