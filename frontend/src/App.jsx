import { useState } from 'react';
import { Routes, Route, Navigate, useParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './hooks/useAuth.js';
import OrganizationProvider from './hooks/OrganizationProvider.jsx';
import { useOrganization, useCan } from './hooks/useOrganization.js';
import Layout from './components/Layout.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Connect from './pages/Connect.jsx';
import Contacts from './pages/Contacts.jsx';
import Flows from './pages/Flows.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Prospecting from './pages/Prospecting.jsx';
import Subscription from './pages/Subscription.jsx';
import FlowEditor from './pages/FlowEditor.jsx';
import Team from './pages/Team.jsx';
import Admin from './pages/Admin.jsx';
import { api } from './api/client.js';
import { useEffect } from 'react';

export default function App() {
  const { session, organizations, loading } = useAuth();

  if (loading) return <Fullscreen spinner />;

  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={session ? <HomeRedirect /> : <Landing />} />
      <Route path="/entrar" element={session ? <HomeRedirect /> : <Login />} />
      <Route path="/criar-conta" element={session ? <HomeRedirect /> : <Signup />} />

      {/* Painel de controle global (super admin) */}
      <Route path="/admin" element={session ? <AdminGate /> : <Navigate to="/entrar" replace />} />

      {/* Painel, sempre no contexto de uma organização */}
      <Route
        path="/org/:orgId/*"
        element={session ? <OrgShell /> : <Navigate to="/entrar" replace />}
      />

      {/* Rotas antigas sem org na URL — manda para a organização do usuário */}
      <Route path="*" element={session ? <HomeRedirect /> : <Navigate to="/" replace />} />
    </Routes>
  );
}

// Manda o usuário para a primeira organização dele. Se não tiver nenhuma
// (confirmou e-mail e voltou, ou foi removido), pede para criar.
// Só o super admin entra no /admin; qualquer outro é mandado para o início.
function AdminGate() {
  const [state, setState] = useState('checking'); // checking | ok | denied

  useEffect(() => {
    api.get('/api/admin/me')
      .then(() => setState('ok'))
      .catch(() => setState('denied'));
  }, []);

  if (state === 'checking') return <Fullscreen spinner />;
  if (state === 'denied') return <Navigate to="/" replace />;
  return <Admin />;
}

function HomeRedirect() {
  const { organizations } = useAuth();

  if (organizations === null) return <Fullscreen spinner />;
  if (organizations.length === 0) return <NoOrganization />;

  return <Navigate to={`/org/${organizations[0].id}/inicio`} replace />;
}

function OrgShell() {
  const { orgId } = useParams();
  const { organizations } = useAuth();

  if (organizations === null) return <Fullscreen spinner />;

  // Não deixa abrir uma org que não é do usuário
  if (organizations.length > 0 && !organizations.some((o) => o.id === orgId)) {
    return (
      <Fullscreen>
        <p className="text-slate-600">Você não tem acesso a esta organização.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-brand-700 hover:text-brand-800">
          Voltar para o início
        </Link>
      </Fullscreen>
    );
  }

  return (
    <OrganizationProvider orgId={orgId}>
      <OrgRoutes />
    </OrganizationProvider>
  );
}

function OrgRoutes() {
  const { agent, loading, error } = useOrganization();
  const can = useCan();

  if (loading) return <Fullscreen spinner />;
  if (error || !agent) {
    return (
      <Fullscreen>
        <p className="text-slate-600 max-w-sm">{error || 'Organização indisponível.'}</p>
      </Fullscreen>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="inicio" replace />} />
        <Route path="inicio" element={<Dashboard agent={agent} />} />
        <Route path="fluxos" element={<Flows />} />
        <Route path="fluxos/:flowId" element={<FlowEditor />} />
        <Route path="dispositivos" element={<Connect agent={agent} />} />
        <Route path="contatos" element={<Contacts />} />
        <Route path="campanhas" element={<Campaigns />} />
        <Route path="prospeccao" element={<Prospecting />} />
        <Route
          path="equipe"
          element={can.manageTeam ? <Team /> : <UpgradeNeeded feature="a gestão de equipe" />}
        />
        <Route path="assinatura" element={<Subscription />} />

        {/* Inbox e Kanban dependem do plano */}
        <Route
          path="inbox"
          element={can.inbox ? <Inbox agent={agent} /> : <UpgradeNeeded feature="o Inbox" />}
        />
        <Route
          path="kanban"
          element={can.kanban ? <Contacts /> : <UpgradeNeeded feature="o Kanban" />}
        />

        <Route path="*" element={<Navigate to="inicio" replace />} />
      </Routes>
    </Layout>
  );
}

function UpgradeNeeded({ feature }) {
  const { orgId } = useOrganization();
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-slate-800">
          {feature} não está no seu plano
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Faça upgrade para o plano Completo e libere {feature} para toda a equipe.
        </p>
        <Link
          to={`/org/${orgId}/assinatura`}
          className="mt-5 inline-flex px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}

function NoOrganization() {
  const { bootstrapOrganization } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function criar(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await bootstrapOrganization({ organizationName: name.trim() });
      // loadOrganizations dentro do bootstrap atualiza o estado e a rota segue.
    } catch (err) {
      // Antes isto falhava calado (ex: backend fora do ar) e o botão parecia
      // morto. Agora o motivo aparece na tela.
      setError(
        err?.response?.data?.error ||
          'Não foi possível criar a organização agora. Verifique sua conexão e tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Fullscreen>
      <form onSubmit={criar} className="w-full max-w-sm space-y-3">
        <p className="text-slate-600">
          Sua conta ainda não tem uma organização. Dê um nome para começar.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da sua empresa"
          autoFocus
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-left">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {busy ? 'Criando...' : 'Criar organização'}
        </button>
      </form>
    </Fullscreen>
  );
}

function Fullscreen({ children, spinner }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center text-center px-6">
      {spinner ? <Loader2 className="animate-spin text-brand-500" size={24} /> : children}
    </div>
  );
}
