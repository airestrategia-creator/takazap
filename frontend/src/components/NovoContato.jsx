import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';

export default function NovoContato({ stages, agents, companies = [], onClose, onCriado }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    funnel_stage_id: '',
    assigned_agent_id: '',
    deal_value: '',
    company_id: companies.length === 1 ? companies[0].id : '',
    company_name: '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post('/api/contacts', {
        name: form.name,
        phone: form.phone,
        funnel_stage_id: form.funnel_stage_id || null,
        assigned_agent_id: form.assigned_agent_id || null,
        deal_value: form.deal_value ? Number(form.deal_value) : null,
        company_id: form.company_id || null,
        company_name: form.company_name,
      });
      onCriado();
      onClose();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <form
          onSubmit={salvar}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-5 space-y-4 pointer-events-auto"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Novo contato</h3>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500">Nome</span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Como você chama essa pessoa"
              autoFocus
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Telefone com DDD *</span>
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="62 99999-9999"
              required
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <span className="text-[11px] text-slate-400">
              Pode digitar com espaços e traços — o sistema limpa sozinho.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">Etapa</span>
              <select
                value={form.funnel_stage_id}
                onChange={(e) => set('funnel_stage_id', e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
              <span className="text-xs text-slate-500">Valor (R$)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.deal_value}
                onChange={(e) => set('deal_value', e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
          </div>

          {companies.length > 0 && (
            <label className="block">
              <span className="text-xs text-slate-500">Sua empresa (de quem é o contato)</span>
              <select
                value={form.company_id}
                onChange={(e) => set('company_id', e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="">Nenhuma</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            {/* Diferente do campo acima: aqui é a empresa do cliente, não a sua.
                "João da Padaria Silva" é dado do contato, texto livre. */}
            <span className="text-xs text-slate-500">Onde essa pessoa trabalha</span>
            <input
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
              placeholder="Padaria Silva"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Responsável</span>
            <select
              value={form.assigned_agent_id}
              onChange={(e) => set('assigned_agent_id', e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Ninguém</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 size={15} className="animate-spin" />}
            {salvando ? 'Salvando...' : 'Criar contato'}
          </button>
        </form>
      </div>
    </>
  );
}
