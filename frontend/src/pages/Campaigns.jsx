import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', session_id: '', message_template: '',
    target_tag_ids: [], min_delay_seconds: 8, max_delay_seconds: 25,
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [c, s, t] = await Promise.all([
      api.get('/api/campaigns'),
      api.get('/api/sessions'),
      api.get('/api/tags'),
    ]);
    setCampaigns(c.data);
    setSessions(s.data);
    setTags(t.data);
  }

  async function createCampaign(e) {
    e.preventDefault();
    await api.post('/api/campaigns', form);
    setCreating(false);
    setForm({ name: '', session_id: '', message_template: '', target_tag_ids: [], min_delay_seconds: 8, max_delay_seconds: 25 });
    await load();
  }

  async function start(id) {
    await api.post(`/api/campaigns/${id}/start`);
    await load();
  }

  async function pause(id) {
    await api.post(`/api/campaigns/${id}/pause`);
    await load();
  }

  function toggleTag(tagId) {
    setForm((prev) => ({
      ...prev,
      target_tag_ids: prev.target_tag_ids.includes(tagId)
        ? prev.target_tag_ids.filter((t) => t !== tagId)
        : [...prev.target_tag_ids, tagId],
    }));
  }

  return (
    <div className="p-6 h-full overflow-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Campanhas / Disparo em massa</h2>
        <button onClick={() => setCreating((v) => !v)} className="bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm">
          {creating ? 'Cancelar' : '+ Nova campanha'}
        </button>
      </div>

      {creating && (
        <form onSubmit={createCampaign} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
          <input
            required
            placeholder="Nome da campanha"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
          <select
            required
            value={form.session_id}
            onChange={(e) => setForm({ ...form, session_id: e.target.value })}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Selecione o número conectado</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.label} ({s.phone_number || 'não conectado'})</option>
            ))}
          </select>
          <textarea
            required
            placeholder="Mensagem. Use {{nome}} para o nome do contato."
            value={form.message_template}
            onChange={(e) => setForm({ ...form, message_template: e.target.value })}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            rows={3}
          />

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Segmentar por tag (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`text-xs px-2 py-1 rounded-full border ${
                    form.target_tag_ids.includes(t.id) ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {tags.length === 0 && <p className="text-xs text-slate-400">Sem tags cadastradas — a campanha vai para todos os contatos.</p>}
            </div>
          </div>

          <div className="flex gap-3">
            <label className="text-xs text-slate-500">
              Delay mín. (s)
              <input
                type="number"
                min={3}
                value={form.min_delay_seconds}
                onChange={(e) => setForm({ ...form, min_delay_seconds: Number(e.target.value) })}
                className="block border border-slate-300 rounded px-2 py-1 text-sm w-24 mt-1"
              />
            </label>
            <label className="text-xs text-slate-500">
              Delay máx. (s)
              <input
                type="number"
                min={3}
                value={form.max_delay_seconds}
                onChange={(e) => setForm({ ...form, max_delay_seconds: Number(e.target.value) })}
                className="block border border-slate-300 rounded px-2 py-1 text-sm w-24 mt-1"
              />
            </label>
          </div>

          <button className="bg-brand-600 text-white rounded-lg px-4 py-2 text-sm">Criar campanha</button>
        </form>
      )}

      <div className="grid gap-3">
        {campaigns.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {c.sent_count}/{c.total_contacts} enviados · status: {c.status}
                </p>
              </div>
              <div className="flex gap-2">
                {c.status !== 'running' && (
                  <button onClick={() => start(c.id)} className="text-xs bg-brand-600 text-white rounded-full px-3 py-1">
                    {c.status === 'completed' ? 'Concluída' : 'Iniciar'}
                  </button>
                )}
                {c.status === 'running' && (
                  <button onClick={() => pause(c.id)} className="text-xs bg-amber-500 text-white rounded-full px-3 py-1">
                    Pausar
                  </button>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
              <div
                className="bg-brand-600 h-1.5 rounded-full"
                style={{ width: `${c.total_contacts ? (c.sent_count / c.total_contacts) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
        {campaigns.length === 0 && <p className="text-sm text-slate-400">Nenhuma campanha criada ainda.</p>}
      </div>
    </div>
  );
}
