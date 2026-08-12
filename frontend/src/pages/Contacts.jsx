import { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { api } from '../api/client.js';
import LeadDetail from '../components/LeadDetail.jsx';
import NovoContato from '../components/NovoContato.jsx';

export const dinheiro = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Contacts() {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [agents, setAgents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newStageName, setNewStageName] = useState('');

  const [busca, setBusca] = useState('');
  const [tagFiltro, setTagFiltro] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    recarregar();
  }, []);

  async function recarregar() {
    const [s, c, t, a, e] = await Promise.all([
      api.get('/api/funnel-stages'),
      api.get('/api/contacts'),
      api.get('/api/tags'),
      api.get('/api/agents'),
      api.get('/api/companies').catch(() => ({ data: [] })),
    ]);
    setStages(s.data);
    setContacts(c.data);
    setTags(t.data);
    setAgents(a.data);
    setCompanies(e.data || []);
  }

  async function addStage() {
    if (!newStageName.trim()) return;
    await api.post('/api/funnel-stages', { name: newStageName, position: stages.length });
    setNewStageName('');
    recarregar();
  }

  async function renomearEtapa(id, nome) {
    await api.patch(`/api/funnel-stages/${id}`, { name: nome });
    recarregar();
  }

  async function excluirEtapa(stage) {
    const quantos = contacts.filter((c) => c.funnel_stage_id === stage.id).length;
    const aviso = quantos
      ? `Excluir "${stage.name}"? Os ${quantos} contatos dessa coluna voltam para "Sem estágio" — nenhum é apagado.`
      : `Excluir a etapa "${stage.name}"?`;
    if (!window.confirm(aviso)) return;
    await api.delete(`/api/funnel-stages/${stage.id}`);
    recarregar();
  }

  async function moveContact(contactId, stageId) {
    // Move na tela antes da resposta do servidor: arrastar e ver o card
    // "voltar" por meio segundo até o refetch chegar passa sensação de travado.
    setContacts((atuais) =>
      atuais.map((c) => (c.id === contactId ? { ...c, funnel_stage_id: stageId } : c)),
    );
    try {
      await api.patch(`/api/contacts/${contactId}`, { funnel_stage_id: stageId });
    } finally {
      recarregar();
    }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contacts.filter((c) => {
      const casaBusca =
        !termo ||
        (c.name || '').toLowerCase().includes(termo) ||
        (c.phone || '').includes(termo);
      const casaTag =
        !tagFiltro || (c.contact_tags || []).some((t) => t.tag_id === tagFiltro);
      const casaEmpresa = !empresaFiltro || c.company_id === empresaFiltro;
      return casaBusca && casaTag && casaEmpresa;
    });
  }, [contacts, busca, tagFiltro, empresaFiltro]);

  const selecionado = contacts.find((c) => c.id === selecionadoId) || null;
  const filtrando = busca.trim() || tagFiltro || empresaFiltro;
  const totalGeral = visiveis.reduce((s, c) => s + Number(c.deal_value || 0), 0);

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">CRM — Funil de vendas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {visiveis.length} {visiveis.length === 1 ? 'contato' : 'contatos'}
            {filtrando && ` de ${contacts.length}`}
            {totalGeral > 0 && ` · ${dinheiro(totalGeral)} em negociação`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="border border-slate-300 rounded-lg pl-8 pr-8 py-1.5 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {companies.length > 0 && (
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="">Todas as etiquetas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStage()}
            placeholder="Novo estágio (ex: Negociação)"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button
            onClick={addStage}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm"
          >
            Adicionar estágio
          </button>
          <button
            onClick={() => setCriando(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5"
          >
            <Plus size={15} /> Novo contato
          </button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        <StageColumn
          stage={{ id: null, name: 'Sem estágio' }}
          contacts={visiveis.filter((c) => !c.funnel_stage_id)}
          agents={agents}
          onDrop={moveContact}
          onOpen={setSelecionadoId}
        />
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            contacts={visiveis.filter((c) => c.funnel_stage_id === stage.id)}
            agents={agents}
            onDrop={moveContact}
            onOpen={setSelecionadoId}
            onRenomear={renomearEtapa}
            onExcluir={excluirEtapa}
          />
        ))}
      </div>

      {criando && (
        <NovoContato
          stages={stages}
          agents={agents}
          companies={companies}
          onClose={() => setCriando(false)}
          onCriado={recarregar}
        />
      )}

      {selecionado && (
        <LeadDetail
          contact={selecionado}
          stages={stages}
          tags={tags}
          agents={agents}
          companies={companies}
          onClose={() => setSelecionadoId(null)}
          onChanged={recarregar}
        />
      )}
    </div>
  );
}

// Quantos dias o lead está parado. Serve para o card avisar sozinho quem está
// esfriando, em vez de exigir que alguém confira contato por contato.
function diasParado(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function StageColumn({ stage, contacts, agents, onDrop, onOpen, onRenomear, onExcluir }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(stage.name);
  const total = contacts.reduce((s, c) => s + Number(c.deal_value || 0), 0);
  const editavel = Boolean(stage.id); // "Sem estágio" é virtual, não existe no banco

  function confirmarNome() {
    setEditando(false);
    if (nome.trim() && nome !== stage.name) onRenomear(stage.id, nome.trim());
    else setNome(stage.name);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const contactId = e.dataTransfer.getData('contactId');
        onDrop(contactId, stage.id);
      }}
      className="bg-white rounded-xl border border-slate-200 w-64 flex-shrink-0 flex flex-col"
    >
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center justify-between gap-1 group">
          {editando ? (
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={confirmarNome}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarNome();
                if (e.key === 'Escape') {
                  setNome(stage.name);
                  setEditando(false);
                }
              }}
              autoFocus
              className="text-sm font-medium text-slate-700 border-b border-brand-500 focus:outline-none w-full bg-transparent"
            />
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700 truncate">{stage.name}</p>
              <div className="flex items-center gap-1 shrink-0">
                {editavel && (
                  <>
                    <button
                      onClick={() => setEditando(true)}
                      title="Renomear"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => onExcluir(stage)}
                      title="Excluir etapa"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
                <span className="text-xs text-slate-400">{contacts.length}</span>
              </div>
            </>
          )}
        </div>
        {total > 0 && (
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">{dinheiro(total)}</p>
        )}
      </div>
      <div className="p-2 space-y-2 min-h-[120px]">
        {contacts.length === 0 && (
          <p className="text-xs text-slate-300 text-center py-4">Vazio</p>
        )}
        {contacts.map((c) => {
          const dias = diasParado(c.last_message_at);
          const responsavel = agents.find((a) => a.id === c.assigned_agent_id);
          return (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('contactId', c.id)}
              onClick={() => onOpen(c.id)}
              className="bg-slate-50 border border-slate-200 rounded-lg p-2 cursor-pointer hover:border-brand-400 hover:bg-white transition"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {c.name || c.phone}
                </p>
                {responsavel && (
                  <span
                    title={responsavel.name}
                    className="shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center"
                  >
                    {responsavel.name?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{c.phone}</p>
              {(c.companies || c.company_name) && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  {c.companies && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: c.companies.color }}
                    />
                  )}
                  {[c.companies?.name, c.company_name].filter(Boolean).join(' · ')}
                </p>
              )}
              {Number(c.deal_value) > 0 && (
                <p className="text-xs font-medium text-emerald-600 mt-0.5">
                  {dinheiro(c.deal_value)}
                </p>
              )}

              <div className="flex gap-1 mt-1 flex-wrap">
                {(c.contact_tags || []).map((t) => (
                  <span
                    key={t.tag_id}
                    className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: t.tags?.color || '#10b981' }}
                  >
                    {t.tags?.name}
                  </span>
                ))}
              </div>

              {dias !== null && dias >= 3 && (
                <p
                  className={`text-[10px] mt-1.5 ${
                    dias >= 7 ? 'text-red-600' : 'text-amber-600'
                  }`}
                >
                  {dias} dias sem mensagem
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
