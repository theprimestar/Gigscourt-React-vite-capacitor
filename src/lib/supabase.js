import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jyvkbhbkziyitfzehoxi.supabase.co';
const supabaseAnonKey = 'sb_publishable_MA8q_7DYgqliOz-HKZofYg_CzGnE6Ol';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
