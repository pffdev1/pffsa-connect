import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const getRuntimeConfig = async () =>
  supabase
    .from('app_runtime_config')
    .select('*')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
