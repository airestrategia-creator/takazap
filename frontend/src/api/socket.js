import { io } from 'socket.io-client';
import { supabase } from './client.js';

/**
 * Abre o socket já autenticado e entra na sala da organização.
 *
 * Use sempre esta função em vez de chamar io() direto: o servidor recusa
 * conexão sem token, e é ele quem confere se você pertence mesmo à
 * organização que pediu.
 */
export async function connectSocket(organizationId) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => socket.emit('join', { organizationId }));
  return socket;
}
