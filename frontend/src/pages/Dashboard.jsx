import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessagesSquare, Users, Send, Search, Wifi, WifiOff, ArrowRight, Inbox,
} from 'lucide-react';
import { api } from '../api/client.js';

export default function Dashboard({ agent }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [unassigned, mine, contacts, campaigns, sessions, searches] = await Promise.all([
        api.get('/api/conversations', { params: { unassigned: 'true' } }),
        api.get('/api/conversations', { params: { mine: 'true' } }),
        api.get('/api/contacts'),
        api.get('/api/campaigns'),
        api.get('/api/sessions'),
        api.get('/api/prospecting/searches'),
      ]);

      setStats({
        unassignedCount: unassigned.data.length,
        mineCount: mine.data.length,
        contactsCount: contacts.data.length,
        activeCampaigns: campaigns.data.filter((c) => c.status === 'running').length,
        session: sessions.data[0] || null,
        leadsFound: searches.data.reduce((sum, s) => sum + (s.lead_count || 0), 0),
      });
    } finally {
      setLoading(false);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  if (loading || !stats) {
    return (
      <div className="p-6 h-full flex items-center justify-center text-slate-400 text-sm">
        Carregando painel...
      </div>
    );
  }

  const connected = stats.session?.status === 'connected';

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-800">{greeting}, {agent.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Aqui está um resumo do seu atendimento hoje.</p>
      </div>

      {!connected && (
        <button
          onClick={() => navigate('/conexao')}
          className="w-full mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-left hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <WifiOff size={20} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Seu WhatsApp ainda não está conectado</p>
              <p className="text-xs text-amber-700">Conecte um número para começar a atender e disparar campanhas.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-amber-600 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Inbox}
          label="Fila de atendimento"
          value={stats.unassignedCount}
          hint="sem atendente"
          accent="text-amber-600 bg-amber-50"
          onClick={() => navigate('/inbox')}
        />
        <StatCard
          icon={MessagesSquare}
          label="Minhas conversas"
          value={stats.mineCount}
          hint="atribuídas a você"
          accent="text-brand-700 bg-brand-50"
          onClick={() => navigate('/inbox')}
        />
        <StatCard
          icon={Users}
          label="Contatos no CRM"
          value={stats.contactsCount}
          hint="no total"
          accent="text-indigo-700 bg-indigo-50"
          onClick={() => navigate('/contatos')}
        />
        <StatCard
          icon={Send}
          label="Campanhas ativas"
          value={stats.activeCampaigns}
          hint="disparando agora"
          accent="text-pink-700 bg-pink-50"
          onClick={() => navigate('/campanhas')}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <QuickLink
          icon={Wifi}
          title="Conexão WhatsApp"
          description={connected ? `Conectado: ${stats.session?.phone_number || ''}` : 'Nenhum número conectado ainda'}
          cta="Gerenciar"
          onClick={() => navigate('/conexao')}
          ok={connected}
        />
        <QuickLink
          icon={Search}
          title="Prospecção"
          description={`${stats.leadsFound} estabelecimentos encontrados até agora`}
          cta="Buscar leads"
          onClick={() => navigate('/prospeccao')}
        />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <p className="text-2xl font-semibold text-slate-800 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label} · {hint}</p>
    </button>
  );
}

function QuickLink({ icon: Icon, title, description, cta, onClick, ok }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between text-left hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ok ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{title}</p>
          <p className="text-xs text-slate-500 truncate">{description}</p>
        </div>
      </div>
      <span className="text-xs text-brand-700 font-medium flex items-center gap-1 shrink-0">
        {cta} <ArrowRight size={14} />
      </span>
    </button>
  );
}
