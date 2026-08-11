import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { connectSocket } from '../api/socket.js';

const FILTERS = [
  { key: 'unassigned', label: 'Fila (sem atendente)' },
  { key: 'mine', label: 'Minhas conversas' },
  { key: 'all', label: 'Todas' },
];

export default function Inbox({ agent }) {
  const [filter, setFilter] = useState('unassigned');
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [agents, setAgents] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadConversations();
    api.get('/api/agents').then((r) => setAgents(r.data));

    let socket;
    connectSocket(agent.organization_id).then((s) => {
      if (!s) return;
      socket = s;
      socket.on('message:new', (msg) => {
        if (active && msg.conversation_id === active.id) {
          setMessages((prev) => [...prev, msg]);
        }
        loadConversations();
      });
      socket.on('conversation:updated', () => loadConversations());
    });
    return () => socket?.disconnect();
  }, [filter, active?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    const params = filter === 'all' ? {} : { [filter]: 'true' };
    const { data } = await api.get('/api/conversations', { params });
    setConversations(data);
  }

  async function openConversation(conv) {
    setActive(conv);
    const { data } = await api.get(`/api/conversations/${conv.id}/messages`);
    setMessages(data);
  }

  async function claim(conv) {
    await api.post(`/api/conversations/${conv.id}/claim`);
    await loadConversations();
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !active) return;
    const text = draft;
    setDraft('');
    const { data } = await api.post(`/api/conversations/${active.id}/messages`, { text });
    setMessages((prev) => [...prev, data]);
  }

  async function transfer(agentId) {
    if (!active) return;
    await api.post(`/api/conversations/${active.id}/transfer`, { agentId });
    await loadConversations();
  }

  return (
    <div className="h-full grid grid-cols-[280px_1fr_260px]">
      {/* Lista de conversas / fila */}
      <div className="border-r border-slate-200 bg-white flex flex-col">
        <div className="flex text-xs border-b border-slate-200">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 py-2 ${filter === f.key ? 'text-brand-700 font-medium border-b-2 border-brand-600' : 'text-slate-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 ${active?.id === c.id ? 'bg-brand-50' : ''}`}
            >
              <p className="text-sm font-medium text-slate-800 truncate">{c.contacts?.name || c.contacts?.phone}</p>
              <p className="text-xs text-slate-500">
                {c.bot_active ? '🤖 bot ativo' : c.agents ? `👤 ${c.agents.name}` : 'sem atendente'}
              </p>
            </button>
          ))}
          {conversations.length === 0 && <p className="text-xs text-slate-400 p-4">Nenhuma conversa aqui.</p>}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col bg-slate-50">
        {active ? (
          <>
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <p className="font-medium text-slate-800">{active.contacts?.name || active.contacts?.phone}</p>
              {active.bot_active ? (
                <button onClick={() => claim(active)} className="text-xs bg-brand-600 text-white rounded-full px-3 py-1">
                  Assumir conversa
                </button>
              ) : (
                <span className="text-xs text-slate-500">Atendimento humano</span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
                      m.direction === 'outbound'
                        ? m.sender_type === 'bot' ? 'bg-slate-700 text-white' : 'bg-brand-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Digite uma mensagem..."
                className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm"
              />
              <button className="bg-brand-600 text-white rounded-full px-4 py-2 text-sm">Enviar</button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Selecione uma conversa
          </div>
        )}
      </div>

      {/* Painel lateral: transferência */}
      <div className="border-l border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Transferir para</p>
        {active ? (
          <div className="space-y-1">
            {agents.filter((a) => a.id !== agent.id).map((a) => (
              <button
                key={a.id}
                onClick={() => transfer(a.id)}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-slate-50"
              >
                {a.name} <span className="text-xs text-slate-400">({a.status})</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Selecione uma conversa</p>
        )}
      </div>
    </div>
  );
}
