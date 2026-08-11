import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Este client usa a service_role key: roda no backend, nunca é exposto ao
// frontend, e ignora RLS de propósito (o backend é quem aplica as regras
// de negócio e o isolamento por organização).
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});
