import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const fetchProfileByUserId = async (userId) =>
  supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
