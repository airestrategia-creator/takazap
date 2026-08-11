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

export default function App() {
  const { session, organizations, loading } = useAuth();

  if (loading) return <Fullscreen spinner />;

  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={session ? <HomeRedirect /> : <Landing />} />
      <Route path="/entrar" element={session ? <HomeRedirect /> : <Login />} />
      <Route path="/criar-conta" element={session ? <HomeRedirect /> : <Signup />} />

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
  return (
    <Fullscreen>
      <p className="text-slate-600 max-w-sm">
        Sua conta ainda não tem uma organização. Vamos criar uma para você começar.
      </p>
      <button
        onClick={async () => {
          const name = window.prompt('Qual o nome da sua empresa?');
          if (!name?.trim()) return;
          await bootstrapOrganization({ organizationName: name.trim() });
        }}
        className="mt-4 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
      >
        Criar organização
      </button>
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
