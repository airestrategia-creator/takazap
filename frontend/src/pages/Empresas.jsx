import { useEffect, useState } from 'react';
import { Building2, Plus, Trash2, Loader2, Smartphone } from 'lucide-react';
import { api } from '../api/client.js';

const CORES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

// Painel das unidades de negócio. Cada empresa separa carteira de contatos,
// campanhas e prospecção — é o que permite disparar para o público de uma sem
// atingir o das outras.
export default function Empresas() {
  const [empresas, setEmpresas] = useState(null);
  const [sessoes, setSessoes] = useState([]);
  const [form, setForm] = useState({ name: '', document: '', color: CORES[0], session_id: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const [e, s] = await Promise.all([
      api.get('/api/companies'),
      api.get('/api/sessions').catch(() => ({ data: [] })),
    ]);
    setEmpresas(e.data);
    setSessoes(s.data || []);
  }

  async function criar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post('/api/companies', { ...form, session_id: form.session_id || null });
      setForm({ name: '', document: '', color: CORES[0], session_id: '' });
      carregar();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function atualizar(id, campos) {
    await api.patch(`/api/companies/${id}`, campos);
    carregar();
  }

  async function excluir(empresa) {
    const aviso = empresa.contacts_count
      ? `Excluir "${empresa.name}"? Os ${empresa.contacts_count} contatos dela ficam sem empresa — nenhum é apagado.`
      : `Excluir a empresa "${empresa.name}"?`;
    if (!window.confirm(aviso)) return;
    await api.delete(`/api/companies/${empresa.id}`);
    carregar();
  }

  return (
    <div className="p-6 h-full overflow-auto max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-800">Empresas</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          Suas unidades de negócio. Cada contato, campanha e prospecção pertence
          a uma empresa — é assim que um disparo da ITA Frotas não vai para os
          clientes da ITA Mob.
        </p>
      </div>

      <form
        onSubmit={criar}
        className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-slate-500">Nome da empresa *</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ITA Frotas"
              required
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">CNPJ (opcional)</span>
            <input
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
              placeholder="00.000.000/0001-00"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Número de WhatsApp</span>
            <select
              value={form.session_id}
              onChange={(e) => setForm({ ...form, session_id: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Usar qualquer número</option>
              {sessoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} {s.phone_number ? `(${s.phone_number})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Cor</span>
            {CORES.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => setForm({ ...form, color: cor })}
                className={`w-5 h-5 rounded-full transition ${
                  form.color === cor ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                }`}
                style={{ backgroundColor: cor }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={salvando}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-1.5"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Cadastrar empresa
          </button>
        </div>

        {erro && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}
      </form>

      {empresas === null ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : empresas.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl">
          <Building2 size={30} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Nenhuma empresa cadastrada ainda.</p>
          <p className="text-xs text-slate-400 mt-1">
            Enquanto não houver nenhuma, tudo funciona normalmente — os contatos
            só ficam sem separação por unidade.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {empresas.map((e) => (
            <div
              key={e.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4"
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: e.color }}
              >
                <Building2 size={17} />
              </span>

              <div className="flex-1 min-w-0">
                <input
                  defaultValue={e.name}
                  onBlur={(ev) =>
                    ev.target.value.trim() &&
                    ev.target.value !== e.name &&
                    atualizar(e.id, { name: ev.target.value.trim() })
                  }
                  className="font-medium text-slate-800 text-sm w-full border-0 border-b border-transparent hover:border-slate-200 focus:border-brand-500 focus:outline-none px-0"
                />
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                  <span>
                    {e.contacts_count} {e.contacts_count === 1 ? 'contato' : 'contatos'}
                  </span>
                  {e.document && <span>{e.document}</span>}
                  {e.whatsapp_sessions ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Smartphone size={11} />
                      {e.whatsapp_sessions.label}
                      {e.whatsapp_sessions.phone_number
                        ? ` · ${e.whatsapp_sessions.phone_number}`
                        : ''}
                    </span>
                  ) : (
                    <span className="text-slate-400">sem número dedicado</span>
                  )}
                </div>
              </div>

              <select
                value={e.session_id || ''}
                onChange={(ev) => atualizar(e.id, { session_id: ev.target.value || null })}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs shrink-0"
              >
                <option value="">Qualquer número</option>
                {sessoes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => excluir(e)}
                title="Excluir empresa"
                className="text-slate-400 hover:text-red-600 shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
