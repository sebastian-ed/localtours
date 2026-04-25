import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { APP_CONFIG } from './config.js';

if (!APP_CONFIG.SUPABASE_URL || APP_CONFIG.SUPABASE_URL.includes('TU-PROYECTO')) {
  console.warn('Configurá assets/js/config.js antes de usar la app.');
}

export const supabase = createClient(
  APP_CONFIG.SUPABASE_URL,
  APP_CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
);

export const FUNCTIONS_BASE = `${APP_CONFIG.SUPABASE_URL}/functions/v1`;
export { APP_CONFIG };
