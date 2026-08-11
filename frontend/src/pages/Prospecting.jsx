import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Prospecting() {
  const [configured, setConfigured] = useState(true);
  const [searches, setSearches] = useState([]);
  const [stages, setStages] = useState([]);
  const [form, setForm] = useState({ icpDescription: '', searchQuery: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [statusRes, searchesRes, stagesRes] = await Promise.all([
      api.get('/api/prospecting/status'),
      api.get('/api/prospecting/searches'),
      api.get('/api/funnel-stages'),
    ]);
    setConfigured(statusRes.data.configured);
    setSearches(searchesRes.data);
    setStages(stagesRes.data);
  }

  async function runSearch(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/prospecting/searches', form);
      await load();
      openSearch(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao buscar');
    } finally {
      setLoading(false);
    }
  }

  async function openSearch(search) {
    setActive(search);
    const { data } = await api.get(`/api/prospecting/searches/${search.id}/leads`);
    setLeads(data);
  }

  async function importLead(leadId) {
    await api.post(`/api/prospecting/leads/${leadId}/import`, { funnelStageId: stages[0]?.id });
    await openSearch(active);
  }

  async function importAll() {
    await api.post(`/api/prospecting/searches/${active.id}/import-all`, { funnelStageId: stages[0]?.id });
    await openSearch(active);
  }

  return (
    <div className="p-6 h-full overflow-auto grid grid-cols-[380px_1fr] gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Prospecção</h2>
        <p className="text-sm text-slate-500 mb-4">
          Busca estabelecimentos cadastrados no Google Meu Negócio / Google Maps por categoria e região,
          e importa os que tiverem telefone público direto pro CRM.
        </p>

        {!configured && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 mb-4">
            A busca ainda não está configurada: falta a chave <code>GOOGLE_PLACES_API_KEY</code> no
            servidor (Google Cloud Console → ative "Places API" → crie uma chave).
          </div>
        )}

        <form onSubmit={runSearch} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Descreva seu ICP (contexto)</label>
            <textarea
              value={form.icpDescription}
              onChange={(e) => setForm({ ...form, icpDescription: e.target.value })}
              placeholder="Ex: clínicas odontológicas pequenas/médias, sem WhatsApp automatizado, que atendem particular"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Termo de busca no Google (categoria + região)</label>
            <input
              required
              value={form.searchQuery}
              onChange={(e) => setForm({ ...form, searchQuery: e.target.value })}
              placeholder="Ex: clínicas odontológicas em Pinheiros, São Paulo"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              O Google não filtra por faturamento/porte automaticamente — a busca é por categoria + local,
              como uma pesquisa no Google Maps. Use o ICP acima como lembrete do que você está procurando.
            </p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium"
          >
            {loading ? 'Buscando...' : 'Buscar no Google Meu Negócio'}
          </button>
        </form>

        <p className="text-xs font-semibold text-slate-500 uppercase mt-6 mb-2">Buscas anteriores</p>
        <div className="space-y-2">
          {searches.map((s) => (
            <button
              key={s.id}
              onClick={() => openSearch(s)}
              className={`w-full text-left bg-white rounded-lg border p-3 ${active?.id === s.id ? 'border-brand-500' : 'border-slate-200'}`}
            >
              <p className="text-sm font-medium text-slate-800 truncate">{s.search_query}</p>
              <p className="text-xs text-slate-500">{s.lead_count} resultados · {s.status}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {active ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-slate-800">{active.search_query}</p>
                <p className="text-xs text-slate-500">{leads.length} estabelecimentos encontrados</p>
              </div>
              <button onClick={importAll} className="text-sm bg-brand-600 text-white rounded-lg px-3 py-1.5">
                Importar todos com telefone
              </button>
            </div>
            <div className="grid gap-2">
              {leads.map((l) => (
                <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{l.name}</p>
                    <p className="text-xs text-slate-500">{l.formatted_address}</p>
                    <p className="text-xs text-slate-500">
                      {l.phone || 'sem telefone público'}
                      {l.rating ? ` · ⭐ ${l.rating} (${l.user_ratings_total})` : ''}
                    </p>
                  </div>
                  {l.imported_contact_id ? (
                    <span className="text-xs text-green-600">Importado ✓</span>
                  ) : (
                    <button
                      disabled={!l.phone}
                      onClick={() => importLead(l.id)}
                      className="text-xs border border-slate-300 rounded-full px-3 py-1 disabled:opacity-40"
                    >
                      Importar
                    </button>
                  )}
                </div>
              ))}
              {leads.length === 0 && <p className="text-sm text-slate-400">Nenhum resultado.</p>}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Faça uma busca ou selecione uma busca anterior
          </div>
        )}
      </div>
    </div>
  );
}
