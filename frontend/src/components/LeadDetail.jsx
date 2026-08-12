import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Check, Plus, MessageSquare, StickyNote, User, Phone } from 'lucide-react';
import { api } from '../api/client.js';

// Painel lateral do lead: dados, etiquetas, responsável e o histórico da
// conversa. Fica ao lado do quadro em vez de virar página própria porque a
// pessoa está no meio de uma triagem — tirar ela do Kanban a cada clique
// quebraria o fluxo de trabalho.
export default function LeadDetail({ contact, stages, tags, agents, onClose, onChanged }) {
  const [aba, setAba] = useState('conversa');
  const [nome, setNome] = useState(contact.name || '');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [conversa, setConversa] = useState(null);
  const [mensagens, setMensagens] = useState(null); // null = carregando
  const [nota, setNota] = useState('');
  const fimDaLista = useRef(null);

  const etiquetasDoContato = useMemo(
    () => (contact.contact_tags || []).map((t) => t.tag_id),
    [contact],
  );

  useEffect(() => {
    setNome(contact.name || '');
    setMensagens(null);
    let cancelado = false;

    (async () => {
      try {
        // Não existe endpoint de conversa por contato; a lista já vem com o
        // contato embutido, então filtramos aqui em vez de criar rota nova.
        const { data: conversas } = await api.get('/api/conversations');
        const daPessoa = (conversas || []).find((c) => c.contact_id === contact.id);
        if (cancelado) return;
        setConversa(daPessoa || null);

        if (!daPessoa) return setMensagens([]);
        const { data: msgs } = await api.get(`/api/conversations/${daPessoa.id}/messages`);
        if (!cancelado) setMensagens(msgs || []);
      } catch {
        if (!cancelado) setMensagens([]);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [contact.id]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, aba]);

  async function salvarCampo(campos) {
    setSalvando(true);
    try {
      await api.patch(`/api/contacts/${contact.id}`, campos);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1800);
      onChanged?.();
    } finally {
      setSalvando(false);
    }
  }

  async function alternarEtiqueta(tagId) {
    if (etiquetasDoContato.includes(tagId)) {
      await api.delete(`/api/contacts/${contact.id}/tags/${tagId}`);
    } else {
      await api.post(`/api/contacts/${contact.id}/tags`, { tagId });
    }
    onChanged?.();
  }

  async function salvarNota(e) {
    e.preventDefault();
    if (!nota.trim() || !conversa) return;
    await api.post(`/api/conversations/${conversa.id}/notes`, { note: nota.trim() });
    setNota('');
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col">
        <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => nome !== (contact.name || '') && salvarCampo({ name: nome })}
              placeholder="Sem nome"
              className="w-full text-base font-semibold text-slate-800 border-0 border-b border-transparent hover:border-slate-200 focus:border-brand-500 focus:outline-none px-0 py-0.5"
            />
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
              <Phone size={13} /> {contact.phone || 'sem telefone'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {salvando && <Loader2 size={15} className="animate-spin text-slate-400" />}
            {salvo && <Check size={15} className="text-emerald-500" />}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="px-5 py-4 space-y-4 border-b border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">Etapa do funil</span>
              <select
                value={contact.funnel_stage_id || ''}
                onChange={(e) => salvarCampo({ funnel_stage_id: e.target.value || null })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="">Sem etapa</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-slate-500">Responsável</span>
              <select
                value={contact.assigned_agent_id || ''}
                onChange={(e) => salvarCampo({ assigned_agent_id: e.target.value || null })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="">Ninguém</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs text-slate-500">Etiquetas</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {tags.length === 0 && (
                <span className="text-xs text-slate-400">
                  Nenhuma etiqueta criada ainda.
                </span>
              )}
              {tags.map((t) => {
                const ativa = etiquetasDoContato.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => alternarEtiqueta(t.id)}
                    className={`text-xs px-2 py-1 rounded-full border transition flex items-center gap-1 ${
                      ativa ? 'text-white border-transparent' : 'text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                    style={ativa ? { backgroundColor: t.color || '#10b981' } : undefined}
                  >
                    {ativa ? <Check size={11} /> : <Plus size={11} />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <nav className="flex border-b border-slate-100 px-5">
          {[
            { id: 'conversa', label: 'Conversa', icone: MessageSquare },
            { id: 'nota', label: 'Nota interna', icone: StickyNote },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className={`flex items-center gap-1.5 text-sm py-2.5 px-3 -mb-px border-b-2 transition ${
                aba === t.id
                  ? 'border-brand-600 text-brand-700 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icone size={14} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {aba === 'conversa' ? (
            mensagens === null ? (
              <div className="flex justify-center py-8">
                <Loader2 size={18} className="animate-spin text-slate-400" />
              </div>
            ) : mensagens.length === 0 ? (
              <div className="text-center py-10 px-4">
                <MessageSquare size={28} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Nenhuma mensagem registrada.</p>
                {/* Expectativa importante: o WhatsApp não entrega histórico
                    anterior ao pareamento, então "vazio" aqui costuma ser
                    normal, não defeito. */}
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  O histórico começa a partir do momento em que o número foi
                  conectado. Conversas anteriores ficam só no celular.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mensagens.map((m) => {
                  const minha = m.direction === 'outbound';
                  return (
                    <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          minha
                            ? 'bg-brand-600 text-white rounded-br-sm'
                            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        }`}
                      >
                        {m.content || <span className="opacity-70">[{m.content_type}]</span>}
                        <div
                          className={`text-[10px] mt-1 flex items-center gap-1 ${
                            minha ? 'text-white/70' : 'text-slate-400'
                          }`}
                        >
                          {m.sender_type === 'bot' && 'bot · '}
                          {new Date(m.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={fimDaLista} />
              </div>
            )
          ) : (
            <form onSubmit={salvarNota} className="space-y-3">
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={4}
                placeholder="Anotação visível só para a equipe"
                disabled={!conversa}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50"
              />
              {!conversa && (
                <p className="text-xs text-slate-400">
                  A nota fica presa a uma conversa. Este contato ainda não tem
                  nenhuma — assim que ele mandar ou receber a primeira mensagem,
                  o campo libera.
                </p>
              )}
              <button
                type="submit"
                disabled={!conversa || !nota.trim()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition"
              >
                Salvar nota
              </button>
            </form>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-1.5">
          <User size={12} />
          Criado em{' '}
          {contact.created_at
            ? new Date(contact.created_at).toLocaleDateString('pt-BR')
            : '—'}
        </footer>
      </aside>
    </>
  );
}
