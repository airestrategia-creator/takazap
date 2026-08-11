import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Organização em que o painel está operando. Vem da URL (/org/:orgId/...) e
// acompanha toda chamada, para o backend resolver o vínculo certo.
let currentOrganizationId = null;

export function setCurrentOrganizationId(orgId) {
  currentOrganizationId = orgId || null;
}

export function getCurrentOrganizationId() {
  return currentOrganizationId;
}

// Anexa o token de sessão do Supabase Auth em toda chamada à API
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (currentOrganizationId) config.headers['x-organization-id'] = currentOrganizationId;
  return config;
});
