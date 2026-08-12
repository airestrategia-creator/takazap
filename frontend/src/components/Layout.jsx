import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MessagesSquare, Users, Workflow, Send, Search, Smartphone,
  KanbanSquare, CreditCard, LogOut, ChevronDown, Check, Lock, UserCog, ShieldCheck,
  Building2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useOrganization, useCan } from '../hooks/useOrganization.js';
import { api } from '../api/client.js';

export default function Layout({ children }) {
  const { organizations, signOut } = useAuth();
  const { orgId, agent, billing } = useOrganization();
  const can = useCan();
  const navigate = useNavigate();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Descobre se o usuário logado é super admin, pra mostrar o link do painel
  // de controle. Silencioso: erro/403 = não é.
  useEffect(() => {
    let alive = true;
    api.get('/api/admin/me').then(() => alive && setIsSuperAdmin(true)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const currentOrg = organizations?.find((o) => o.id === orgId);

  // Inbox e Kanban aparecem bloqueados em vez de sumir: assim o usuário
  // descobre o recurso e sabe que existe upgrade.
  const nav = [
    { to: 'inicio', label: 'Visão geral', icon: LayoutDashboard },
    { to: 'fluxos', label: 'Fluxos', icon: Workflow },
    { to: 'dispositivos', label: 'Dispositivos', icon: Smartphone },
    { to: 'inbox', label: 'Inbox', icon: MessagesSquare, locked: !can.inbox },
    { to: 'kanban', label: 'Kanban', icon: KanbanSquare, locked: !can.kanban },
    { to: 'contatos', label: 'Contatos', icon: Users },
    { to: 'empresas', label: 'Empresas', icon: Building2 },
    { to: 'campanhas', label: 'Campanhas', icon: Send },
    { to: 'prospeccao', label: 'Prospecção', icon: Search },
    ...(can.manageTeam ? [{ to: 'equipe', label: 'Equipe', icon: UserCog }] : []),
    { to: 'assinatura', label: 'Assinatura', icon: CreditCard },
  ];

  return (
    <div className="h-screen flex app-shell">
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm shadow-brand-200">
            W
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm leading-tight">TakaZap</p>
            <p className="text-xs text-slate-400 truncate">{agent?.name}</p>
          </div>
        </div>

        {billing?.trial && (
          <div className="mx-2 mt-2 rounded-lg bg-brand-50 ring-1 ring-brand-100 px-3 py-2">
            <p className="text-[11px] font-semibold text-brand-700">Período de testes</p>
            <p className="text-[11px] text-brand-600/80 mt-0.5">
              {daysLeft(billing.subscription?.trial_ends_at)}
            </p>
          </div>
        )}

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.locked && <Lock size={13} className="text-slate-300 shrink-0" />}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-2 border-t border-slate-100 space-y-1">
          <div className="relative">
            <button
              onClick={() => setOrgMenuOpen((v) => !v)}
              aria-expanded={orgMenuOpen}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 border border-slate-200"
            >
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 shrink-0">
                ORG
              </span>
              <span className="flex-1 truncate text-left font-medium">
                {currentOrg?.name || '—'}
              </span>
              <ChevronDown size={14} className="text-slate-400 shrink-0" />
            </button>

            {orgMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg bg-white border border-slate-200 shadow-lg py-1 max-h-60 overflow-y-auto">
                {(organizations || []).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setOrgMenuOpen(false);
                      navigate(`/org/${o.id}/inicio`);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.id === orgId && <Check size={14} className="text-brand-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isSuperAdmin && (
            <NavLink
              to="/admin"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-brand-700 hover:bg-brand-50"
            >
              <ShieldCheck size={17} strokeWidth={2} />
              Painel de controle
            </NavLink>
          )}

          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <LogOut size={17} strokeWidth={2} />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden min-w-0">{children}</main>
    </div>
  );
}

function daysLeft(endsAt) {
  if (!endsAt) return 'Sem prazo definido';
  const days = Math.ceil((new Date(endsAt) - new Date()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Teste encerrado';
  return days === 1 ? 'Último dia' : `${days} dias restantes`;
}
