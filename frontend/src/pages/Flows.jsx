import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Search, Download, Upload, Loader2, Workflow, Zap, Layers,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useOrganization, useCan } from '../hooks/useOrganization.js';

export default function Flows() {
  const navigate = useNavigate();
  const { orgId } = useOrganization();
  const can = useCan();
  const fileInput = useRef(null);

  const [flows, setFlows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/api/flows');
      setFlows(data);
      setSelected(new Set());
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar os fluxos.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!flows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return flows;
    return flows.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.trigger_keywords || []).some((k) => k.toLowerCase().includes(q)),
    );
  }, [flows, query]);

  const activeCount = flows?.filter((f) => f.is_active).length ?? 0;

  async function createFlow() {
    setBusy(true);
    try {
      const { data } = await api.post('/api/flows', { name: 'Novo fluxo' });
      navigate(`/org/${orgId}/fluxos/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar o fluxo.');
      setBusy(false);
    }
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const label = ids.length === 1 ? 'este fluxo' : `estes ${ids.length} fluxos`;
    if (!window.confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`)) return;

    setBusy(true);
    try {
      await api.post('/api/flows/bulk-delete', { ids });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }

  async function exportSelected() {
    setBusy(true);
    try {
      const { data } = await api.post('/api/flows/export', { ids: [...selected] });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível exportar.');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    setBusy(true);
    setError('');
    try {
      const payload = JSON.parse(await file.text());
      const { data } = await api.post('/api/flows/import', payload);
      await load();
      window.alert(
        `${data.imported} fluxo(s) importado(s). Eles entram desativados — revise e ative quando estiver pronto.`,
      );
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? 'O arquivo não é um JSON válido.'
          : err.response?.data?.error || 'Não foi possível importar.',
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!flows) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fluxos</h1>
            <p className="mt-1 text-sm text-slate-500">
              Gerencie suas automações de WhatsApp
            </p>
          </div>
          {/* Atendente não cria nem edita automação — só o backend garante,
              mas escondemos os botões para não oferecer o que dá 403. */}
          {can.isAdmin && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
              >
                <Upload size={15} />
                Importar JSON
              </button>
              <button
                onClick={createFlow}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Plus size={15} />
                Novo fluxo
              </button>
            </div>
          )}
        </header>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric icon={Workflow} label="Total de automações" value={flows.length} />
          <Metric icon={Zap} label="Fluxos ativos" value={`${activeCount}/${flows.length}`} />
          <Metric
            icon={Layers}
            label="Selecionados"
            value={selected.size}
            muted={selected.size === 0}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fluxos..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <button
            onClick={exportSelected}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
          >
            <Download size={15} />
            {selected.size ? `Exportar (${selected.size})` : 'Exportar todos'}
          </button>
          <button
            onClick={removeSelected}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-40"
          >
            <Trash2 size={15} />
            Excluir
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(filtered.map((f) => f.id)) : new Set())
                    }
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                  />
                </th>
                <th className="px-2 py-3 font-medium">Nome do fluxo</th>
                <th className="px-2 py-3 font-medium">Última edição</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="w-16 px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => navigate(`/org/${orgId}/fluxos/${f.id}`)}
                      className="text-left"
                    >
                      <span className="font-medium text-slate-800 hover:text-brand-700">
                        {f.name}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {f.trigger_type === 'keyword'
                          ? (f.trigger_keywords || []).join(', ') || 'sem palavra-chave'
                          : f.trigger_type === 'first_message'
                            ? 'primeira mensagem'
                            : 'manual'}
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-3 text-slate-500">{relativeTime(f.updated_at)}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ring-1 ${
                        f.is_active
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                          : 'bg-slate-100 text-slate-500 ring-slate-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          f.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      {f.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => navigate(`/org/${orgId}/fluxos/${f.id}`)}
                      title="Editar fluxo"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    {flows.length === 0
                      ? 'Nenhum fluxo ainda. Crie o primeiro e monte a automação no editor visual.'
                      : 'Nenhum fluxo encontrado para essa busca.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, muted }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${
            muted ? 'bg-slate-50 text-slate-400 ring-slate-200' : 'bg-brand-50 text-brand-600 ring-brand-100'
          }`}
        >
          <Icon size={15} />
        </span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function relativeTime(value) {
  if (!value) return '—';
  const diffMin = Math.floor((Date.now() - new Date(value)) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(value).toLocaleDateString('pt-BR');
}
