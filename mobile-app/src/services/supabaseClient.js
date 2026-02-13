import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkkifutagnagdvpzepzs.supabase.co';
const supabaseAnonKey = 'sb_publishable_DclEiuGlju-A17rWLUtfbg_OPwZ7aJu';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);