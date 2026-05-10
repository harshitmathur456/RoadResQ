import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

const supabaseUrl = 'https://khayqlonqzpubpxuozit.supabase.co';
const supabaseKey = 'sb_publishable_aHi6wV7pINoolB5obI6Ezg_yRHZO0U5';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
