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
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [buscaContato, setBuscaContato] = useState('');
  const [contatos, setContatos] = useState([]);
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
    setErro('');
    const { data } = await api.get(`/api/conversations/${conv.id}/messages`);
    setMessages(data);
  }

  // Iniciar conversa com quem ainda não escreveu — contato cadastrado à mão,
  // importado da prospecção ou que só existe no CRM.
  async function iniciarConversa(contato) {
    setErro('');
    try {
      const { data } = await api.post('/api/conversations/open', { contactId: contato.id });
      setBuscaContato('');
      setContatos([]);
      await loadConversations();
      await openConversation(data);
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível abrir a conversa.');
    }
  }

  useEffect(() => {
    const termo = buscaContato.trim();
    if (termo.length < 2) return setContatos([]);
    // Espera a digitação parar: buscar a cada tecla dispararia uma consulta
    // por caractere numa máquina que já é apertada.
    const t = setTimeout(async () => {
      const { data } = await api.get('/api/contacts');
      const alvo = termo.toLowerCase();
      setContatos(
        (data || [])
          .filter(
            (c) =>
              (c.name || '').toLowerCase().includes(alvo) || (c.phone || '').includes(termo),
          )
          .slice(0, 6),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [buscaContato]);

  async function claim(conv) {
    setErro('');
    try {
      const { data } = await api.post(`/api/conversations/${conv.id}/claim`);
      // Sem atualizar a conversa aberta, a tela continuava mostrando "Assumir
      // conversa" mesmo depois de assumida: o objeto em `active` guardava o
      // estado antigo, e recarregar só a lista não o alcançava.
      setActive((atual) => (atual?.id === conv.id ? { ...atual, ...data, contacts: atual.contacts } : atual));
      await loadConversations();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível assumir a conversa.');
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !active || enviando) return;
    const text = draft;
    setErro('');
    setEnviando(true);
    try {
      const { data } = await api.post(`/api/conversations/${active.id}/messages`, { text });
      setMessages((prev) => [...prev, data]);
      setDraft('');
    } catch (err) {
      // O rascunho só é limpo quando o envio dá certo. Apagar antes fazia o
      // texto sumir junto com o erro invisível — a pessoa perdia a mensagem
      // sem saber por quê.
      setErro(err?.response?.data?.error || 'Não foi possível enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function transfer(agentId) {
    if (!active) return;
    await api.post(`/api/conversations/${active.id}/transfer`, { agentId });
    await loadConversations();
  }

  // Encerrar tira a conversa da fila. Sem isso o Inbox só cresce: toda
  // conversa já atendida continuava aparecendo como se estivesse aberta.
  async function encerrar() {
    if (!active) return;
    if (!window.confirm('Encerrar este atendimento? A conversa sai da fila e volta se a pessoa escrever de novo.')) return;
    setErro('');
    try {
      await api.post(`/api/conversations/${active.id}/close`);
      setActive(null);
      setMessages([]);
      await loadConversations();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível encerrar.');
    }
  }

  // Caminho de volta para quem assumiu sem querer, ou terminou o atendimento
  // humano e quer o robô cuidando de novo.
  async function devolverAoBot() {
    if (!active) return;
    setErro('');
    try {
      const { data } = await api.post(`/api/conversations/${active.id}/release-to-bot`);
      setActive((atual) => (atual?.id === active.id ? { ...atual, ...data, contacts: atual.contacts } : atual));
      await loadConversations();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível devolver ao bot.');
    }
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
        <div className="p-2 border-b border-slate-100 relative">
          <input
            value={buscaContato}
            onChange={(e) => setBuscaContato(e.target.value)}
            placeholder="Iniciar conversa: nome ou telefone"
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {contatos.length > 0 && (
            <div className="absolute left-2 right-2 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
              {contatos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => iniciarConversa(c)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <p className="text-xs font-medium text-slate-800">{c.name || 'Sem nome'}</p>
                  <p className="text-[11px] text-slate-500">{c.phone}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 ${active?.id === c.id ? 'bg-brand-50' : ''}`}
            >
              {/* Nome e telefone juntos: o telefone é o que identifica de fato
                  no WhatsApp, e muitos contatos entram sem nome. */}
              <p className="text-sm font-medium text-slate-800 truncate">
                {c.contacts?.name || c.contacts?.phone || 'Sem identificação'}
              </p>
              {c.contacts?.name && c.contacts?.phone && (
                <p className="text-[11px] text-slate-400">{c.contacts.phone}</p>
              )}
              <p className="text-xs text-slate-500">
                {c.bot_active ? '🤖 bot ativo' : c.agents ? `👤 ${c.agents.name}` : 'sem atendente'}
              </p>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-4 text-xs text-slate-400 space-y-1">
              <p>Nenhuma conversa aqui.</p>
              <p>Use a busca acima para começar uma com alguém do seu CRM.</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col bg-slate-50">
        {active ? (
          <>
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">
                  {active.contacts?.name || active.contacts?.phone || 'Sem identificação'}
                </p>
                {active.contacts?.phone && (
                  <p className="text-xs text-slate-500">{active.contacts.phone}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {active.bot_active ? (
                  <button onClick={() => claim(active)} className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-full px-3 py-1">
                    Assumir conversa
                  </button>
                ) : (
                  <>
                    <span className="text-xs text-slate-500">Atendimento humano</span>
                    <button
                      onClick={devolverAoBot}
                      title="Deixar o robô responder de novo"
                      className="text-xs border border-slate-300 hover:bg-slate-50 rounded-full px-3 py-1 text-slate-600"
                    >
                      Devolver ao bot
                    </button>
                  </>
                )}
                <button
                  onClick={encerrar}
                  title="Tirar da fila"
                  className="text-xs border border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-full px-3 py-1 text-slate-600"
                >
                  Encerrar
                </button>
              </div>
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
            <div className="bg-white border-t border-slate-200">
              {erro && (
                <p className="mx-3 mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}
              <form onSubmit={sendMessage} className="p-3 flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  disabled={enviando}
                  className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm disabled:bg-slate-50"
                />
                <button
                  disabled={enviando || !draft.trim()}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-full px-4 py-2 text-sm"
                >
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </form>
            </div>
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
