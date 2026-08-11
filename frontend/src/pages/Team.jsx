import { useEffect, useState } from 'react';
import { UserPlus, Trash2, Loader2, ShieldCheck, ShieldAlert, User, Crown } from 'lucide-react';
import { api } from '../api/client.js';
import { useCan } from '../hooks/useOrganization.js';

const ROLE_META = {
  owner: { label: 'Dono', icon: Crown, cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  admin: { label: 'Admin', icon: ShieldCheck, cls: 'bg-brand-50 text-brand-700 ring-brand-100' },
  agent: { label: 'Atendente', icon: User, cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export default function Team() {
  const can = useCan();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState({ email: '', name: '', role: 'agent' });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/api/members');
      setMembers(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a equipe.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setAviso('');
    try {
      const { data } = await api.post('/api/members', form);
      setAviso(data.aviso || 'Membro convidado.');
      setForm({ email: '', name: '', role: 'agent' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível convidar.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id, role) {
    try {
      await api.patch(`/api/members/${id}`, { role });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível mudar o papel.');
    }
  }

  async function remove(id, nome) {
    if (!window.confirm(`Remover ${nome} da equipe? A pessoa perde o acesso a esta organização.`)) return;
    try {
      await api.delete(`/api/members/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível remover.');
    }
  }

  if (!members) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Equipe</h1>
        <p className="mt-1 text-sm text-slate-500">
          Convide atendentes e defina o que cada um pode fazer.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {aviso && (
          <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
            {aviso}
          </p>
        )}

        {can.isAdmin && (
          <form onSubmit={invite} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              <UserPlus size={15} className="text-brand-600" />
              Convidar membro
            </p>
            <div className="mt-3 grid sm:grid-cols-[1.4fr_1fr_auto] gap-2">
              <input
                type="email"
                required
                placeholder="email@empresa.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <input
                placeholder="Nome (opcional)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              {/* Só o dono decide se alguém entra como admin. */}
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                disabled={!can.isOwner}
                title={can.isOwner ? '' : 'Só o dono define admins'}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white disabled:opacity-60 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="agent">Atendente</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              Convidar
            </button>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              O convidado usa "Esqueci a senha" na tela de login para definir a senha antes do
              primeiro acesso.
            </p>
          </form>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Membro</th>
                <th className="px-2 py-3 font-medium">Papel</th>
                {can.isOwner && <th className="w-32 px-4 py-3 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const meta = ROLE_META[m.role] ?? ROLE_META.agent;
                const Icon = meta.icon;
                return (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.email}</p>
                    </td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${meta.cls}`}>
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    {can.isOwner && (
                      <td className="px-4 py-3 text-right">
                        {m.role === 'owner' ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <select
                              value={m.role}
                              onChange={(e) => changeRole(m.id, e.target.value)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white focus:border-brand-500 focus:outline-none"
                            >
                              <option value="agent">Atendente</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              onClick={() => remove(m.id, m.name)}
                              title="Remover"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-xs font-semibold tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldAlert size={13} />
            O QUE CADA PAPEL PODE
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 leading-relaxed">
            <li><b>Dono</b> — tudo, incluindo assinatura e gestão da equipe.</li>
            <li><b>Admin</b> — fluxos, campanhas, dispositivos e prospecção. Não mexe na assinatura.</li>
            <li><b>Atendente</b> — atende conversas no inbox e move cartões no Kanban. Não apaga fluxo nem desconecta número.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
