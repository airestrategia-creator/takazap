import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { connectSocket } from '../api/socket.js';
import { useCan } from '../hooks/useOrganization.js';

export default function Connect({ agent }) {
  const can = useCan();
  const [sessions, setSessions] = useState([]);
  const [qr, setQr] = useState(null);

  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadSessions();
    let socket;
    connectSocket(agent.organization_id).then((s) => {
      if (!s) return;
      socket = s;
      socket.on('qr', ({ qr }) => setQr(qr));
      socket.on('status', () => loadSessions());
    });
    return () => socket?.disconnect();
  }, []);

  // Rede corporativa às vezes bloqueia WebSocket, e aí o QR nunca chegaria.
  // Enquanto houver sessão esperando leitura, também consultamos o servidor.
  useEffect(() => {
    const esperando = sessions.some((s) => s.status === 'qr_pending' || s.status === 'connecting');
    if (!esperando) return;
    const id = setInterval(loadSessions, 3000);
    return () => clearInterval(id);
  }, [sessions]);

  async function loadSessions() {
    const { data } = await api.get('/api/sessions');
    setSessions(data);
    // O QR do banco é a fonte da verdade; o do socket é só para chegar antes.
    const pendente = data.find((s) => s.status === 'qr_pending' && s.qr_code);
    if (pendente) setQr(pendente.qr_code);
    if (data.some((s) => s.status === 'connected')) setQr(null);
  }

  async function createSession() {
    setConnecting(true);
    try {
      await api.post('/api/sessions', { label: 'Principal' });
      await loadSessions();
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectSession(id) {
    await api.delete(`/api/sessions/${id}`);
    await loadSessions();
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Conexão com o WhatsApp</h2>
      <p className="text-sm text-slate-500 mb-6">
        Escaneie o QR code com o WhatsApp do número que vai atender (Configurações → Aparelhos conectados → Conectar um aparelho).
      </p>

      {sessions.length === 0 &&
        (can.isAdmin ? (
          <button
            onClick={createSession}
            disabled={connecting}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm"
          >
            {connecting ? 'Gerando QR code...' : 'Conectar número'}
          </button>
        ) : (
          <p className="text-sm text-slate-500">
            Nenhum número conectado. Peça a um administrador para conectar o WhatsApp.
          </p>
        ))}

      <div className="grid gap-4 mt-4">
        {sessions.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 max-w-md">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-slate-800">{s.label}</p>
                <p className="text-xs text-slate-500">{s.phone_number || 'Ainda não conectado'}</p>
              </div>
              <StatusBadge status={s.status} />
            </div>

            {s.status === 'qr_pending' &&
              (s.qr_code || qr ? (
                <>
                  <img src={s.qr_code || qr} alt="QR code do WhatsApp" className="w-56 h-56 mx-auto" />
                  <p className="mt-2 text-center text-xs text-slate-400">
                    O código expira em cerca de 20s e se renova sozinho.
                  </p>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">Gerando QR code...</p>
              ))}

            {s.status === 'connecting' && (
              <p className="py-8 text-center text-sm text-slate-500">
                Código lido. Finalizando a conexão...
              </p>
            )}

            {s.status === 'connected' && can.isAdmin && (
              <button
                onClick={() => disconnectSession(s.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Desconectar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    connected: ['Conectado', 'bg-green-100 text-green-700'],
    qr_pending: ['Aguardando QR', 'bg-amber-100 text-amber-700'],
    connecting: ['Conectando...', 'bg-slate-100 text-slate-600'],
    disconnected: ['Desconectado', 'bg-slate-100 text-slate-500'],
    error: ['Erro', 'bg-red-100 text-red-700'],
  };
  const [label, cls] = map[status] || map.disconnected;
  return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>{label}</span>;
}
