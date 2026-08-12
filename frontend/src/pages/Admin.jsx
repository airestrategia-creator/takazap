import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Building2, Users, MessageSquare, Send, Search, Plus, ShieldCheck,
  CheckCircle2, PauseCircle, PlayCircle, ChevronDown, ChevronRight, UserPlus, X,
  Pencil, Trash2,
} from 'lucide-react';
import { api } from '../api/client.js';
import { PLANS } from '../lib/plans.js';

const STATUS = {
  pending: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: 'Aprovada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  suspended: { label: 'Suspensa', cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function loadAll() {
    try {
      const [s, o] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/organizations', { params: search ? { search } : {} }),
      ]);
      setStats(s.data);
      setOrgs(o.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar o painel.');
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(loadAll, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function act(orgId, action) {
    await api.post(`/api/admin/organizations/${orgId}/${action}`);
    loadAll();
  }

  if (!orgs || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        {error ? <p className="text-slate-600 max-w-sm text-center">{error}</p> : <Loader2 className="animate-spin" size={22} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center">
              <ShieldCheck size={17} />
            </span>
            <div>
              <p className="font-semibold text-slate-900 leading-tight">Painel de Controle</p>
              <p className="text-xs text-slate-400">TakaZap · administração</p>
            </div>
          </div>
          <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">Voltar ao painel</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Métricas gerais */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric icon={Building2} label="Organizações" value={stats.totals.organizations} />
          <Metric icon={Users} label="Contatos" value={stats.totals.contacts} />
          <Metric icon={MessageSquare} label="Mensagens" value={stats.totals.messages} />
          <Metric icon={Send} label="Campanhas" value={stats.totals.campaigns} />
          <Metric icon={CheckCircle2} label="Aguardando aprovação" value={stats.pendingApproval} highlight={stats.pendingApproval > 0} />
        </section>

        {/* Gráficos */}
        <section className="grid md:grid-cols-2 gap-4">
          <Card title="Mensagens por dia (30 dias)">
            <LineChart days={stats.series.days} series={[
              { name: 'Recebidas', color: '#8b5cf6', values: stats.series.messagesIn },
              { name: 'Enviadas', color: '#c4b5fd', values: stats.series.messagesOut },
            ]} />
          </Card>
          <Card title="Organizações novas por dia (30 dias)">
            <BarChart days={stats.series.days} values={stats.series.newOrganizations} color="#7c3aed" />
          </Card>
          <Card title="Por plano">
            <Distribution data={stats.byPlan} />
          </Card>
          <Card title="Por status de aprovação">
            <Distribution data={{
              Pendente: stats.byAdminStatus.pending || 0,
              Aprovada: stats.byAdminStatus.approved || 0,
              Suspensa: stats.byAdminStatus.suspended || 0,
            }} />
          </Card>
        </section>

        {/* Organizações */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Organizações</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar por organização..."
                  className="rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm w-64 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Plus size={15} /> Nova organização
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Organização</th>
                  <th className="px-2 py-3 font-medium">Dono</th>
                  <th className="px-2 py-3 font-medium">Plano</th>
                  <th className="px-2 py-3 font-medium">Uso</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <OrgRow key={o.id} org={o} onAct={act} onReload={loadAll} />
                ))}
                {orgs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nenhuma organização.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadAll(); }} />}
    </div>
  );
}

function OrgRow({ org, onAct, onReload }) {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(org.name);
  const st = STATUS[org.adminStatus] || STATUS.pending;

  async function salvarNome() {
    setEditando(false);
    if (!nome.trim() || nome === org.name) return setNome(org.name);
    await api.patch(`/api/admin/organizations/${org.id}`, { name: nome.trim() });
    onReload();
  }

  async function excluir() {
    // Confirmação por digitação, não por "ok/cancelar": apagar uma conta leva
    // junto contatos, conversas e campanhas, e não há lixeira.
    const digitado = window.prompt(
      `EXCLUIR "${org.name}" APAGA TUDO: contatos, conversas, campanhas, dispositivos e equipe. Não há como desfazer.\n\nDigite o nome exato da organização para confirmar:`,
    );
    if (digitado === null) return;
    try {
      await api.delete(`/api/admin/organizations/${org.id}`, { data: { confirmName: digitado } });
      onReload();
    } catch (err) {
      alert(err?.response?.data?.error || 'Não foi possível excluir.');
    }
  }

  return (
    <>
      <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
        <td className="px-4 py-3">
          {editando ? (
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={salvarNome}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarNome();
                if (e.key === 'Escape') {
                  setNome(org.name);
                  setEditando(false);
                }
              }}
              autoFocus
              className="font-medium text-slate-800 border-b border-brand-500 focus:outline-none bg-transparent"
            />
          ) : (
            <div className="flex items-center gap-1.5 group">
              <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-left">
                {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                <span className="font-medium text-slate-800">{org.name}</span>
              </button>
              <button
                onClick={() => setEditando(true)}
                title="Renomear"
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </td>
        <td className="px-2 py-3 text-slate-500">{org.owner?.email || '—'}</td>
        <td className="px-2 py-3 text-slate-600">{org.plan}</td>
        <td className="px-2 py-3 text-slate-500 text-xs">
          {org.usage.contacts}c · {org.usage.messages}msg · {org.usage.devices}disp
        </td>
        <td className="px-2 py-3">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${st.cls}`}>{st.label}</span>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {org.adminStatus !== 'approved' && (
            <button onClick={() => onAct(org.id, 'approve')} title="Aprovar" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50">
              <CheckCircle2 size={16} />
            </button>
          )}
          {org.adminStatus !== 'suspended' ? (
            <button onClick={() => onAct(org.id, 'suspend')} title="Suspender" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
              <PauseCircle size={16} />
            </button>
          ) : (
            <button onClick={() => onAct(org.id, 'reactivate')} title="Reativar" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50">
              <PlayCircle size={16} />
            </button>
          )}
          <button
            onClick={excluir}
            title="Excluir organização"
            className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={6} className="px-4 py-4">
            <OrgDetail orgId={org.id} onReload={onReload} />
          </td>
        </tr>
      )}
    </>
  );
}

function OrgDetail({ orgId, onReload }) {
  const [detail, setDetail] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    const { data } = await api.get(`/api/admin/organizations/${orgId}`);
    setDetail(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId]);

  if (!detail) return <p className="text-xs text-slate-400">Carregando...</p>;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-lg bg-white ring-1 ring-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">USO</p>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {[['Contatos', detail.usage.contacts], ['Conversas', detail.usage.conversations], ['Mensagens', detail.usage.messages], ['Campanhas', detail.usage.campaigns], ['Dispositivos', detail.usage.devices], ['Membros', detail.usage.members]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 py-2">
              <p className="text-base font-bold text-slate-800">{v}</p>
              <p className="text-[10px] text-slate-400">{k}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-white ring-1 ring-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500">EQUIPE ({detail.members.length})</p>
          <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800">
            <UserPlus size={13} /> Adicionar usuário
          </button>
        </div>
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {detail.members.map((m) => (
            <li key={m.email} className="flex items-center justify-between text-xs">
              <span className="text-slate-700">{m.name} <span className="text-slate-400">· {m.email}</span></span>
              <span className="text-slate-400">{m.role}</span>
            </li>
          ))}
        </ul>
        {showAdd && <AddMemberForm orgId={orgId} onAdded={() => { setShowAdd(false); load(); onReload(); }} />}
      </div>
    </div>
  );
}

function AddMemberForm({ orgId, onAdded }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'agent' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post(`/api/admin/organizations/${orgId}/members`, form);
      setMsg(data.aviso || 'Adicionado.');
      setForm({ email: '', name: '', role: 'agent' });
      onAdded();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao adicionar.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 border-t border-slate-100 pt-2">
      <input required type="email" placeholder="email@cliente.com" value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      <div className="flex gap-2">
        <input placeholder="Nome" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-1.5 text-xs bg-white">
          <option value="agent">Atendente</option>
          <option value="admin">Admin</option>
          <option value="owner">Dono</option>
        </select>
        <button disabled={busy} className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? '...' : 'Add'}
        </button>
      </div>
      {msg && <p className="text-[11px] text-slate-500">{msg}</p>}
    </form>
  );
}

function CreateOrgModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', ownerEmail: '', ownerName: '', planId: 'trial' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/api/admin/organizations', form);
      setAviso(data.aviso || '');
      setTimeout(onCreated, 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Nova organização</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {aviso ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{aviso}</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Input label="Nome da organização" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Input label="E-mail do dono" type="email" value={form.ownerEmail} onChange={(v) => setForm((f) => ({ ...f, ownerEmail: v }))} required />
            <Input label="Nome do dono" value={form.ownerName} onChange={(v) => setForm((f) => ({ ...f, ownerName: v }))} />
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Plano</span>
              <select value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                <option value="trial">Período de testes</option>
                {Object.values(PLANS).filter((p) => p.id !== 'trial').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Criar organização
            </button>
            <p className="text-[11px] text-slate-400 text-center">O dono define a senha em "Esqueci a senha" antes do primeiro acesso.</p>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- componentes visuais ----------

function Metric({ icon: Icon, label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={15} className={highlight ? 'text-amber-600' : 'text-brand-600'} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500 mb-3">{title}</p>
      {children}
    </div>
  );
}

function LineChart({ days, series }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 100, H = 40;
  const pts = (vals) => vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        {series.map((s) => (
          <polyline key={s.name} points={pts(s.values)} fill="none" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex gap-3 mt-2">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ values, color }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-0.5 h-24">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ height: `${(v / max) * 100}%`, background: color, minHeight: v > 0 ? '2px' : '0' }} title={`${v}`} />
      ))}
    </div>
  );
}

function Distribution({ data }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>{k}</span><span>{v}</span></div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(v / total) * 100}%` }} />
          </div>
        </div>
      ))}
      {entries.length === 0 && <p className="text-xs text-slate-400">Sem dados.</p>}
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, required }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
    </label>
  );
}
