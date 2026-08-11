import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCurrentOrganizationId } from '../api/client.js';

export const OrganizationContext = createContext(null);

// Carrega o contexto da organização aberta na URL: qual é o meu vínculo
// (papel) e o que a assinatura libera. É daqui que sai o gating de Inbox e
// Kanban, igual o Botzap faz.
export function useOrganizationState(orgId) {
  const [agent, setAgent] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setCurrentOrganizationId(orgId);
    try {
      const [agentRes, billingRes] = await Promise.all([
        api.get('/api/agents/me'),
        api.get('/api/subscription'),
      ]);
      setAgent(agentRes.data);
      setBilling(billingRes.data);
    } catch (err) {
      setAgent(null);
      setBilling(null);
      setError(err.response?.data?.error || 'Não foi possível carregar a organização');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return { orgId, agent, billing, loading, error, reload: load };
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization precisa estar dentro de <OrganizationProvider>');
  return ctx;
}

// Atalhos de permissão, para as telas não repetirem a mesma lógica.
export function useCan() {
  const { agent, billing } = useOrganization();
  const limits = billing?.limits;
  const role = agent?.role;
  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
    inbox: !!limits?.inbox,
    kanban: !!limits?.kanban,
    manageTeam: (role === 'owner' || role === 'admin') && (limits?.members ?? 1) > 1,
    billingActive: !!billing?.active,
  };
}
