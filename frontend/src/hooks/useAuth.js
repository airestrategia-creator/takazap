import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, api, setCurrentOrganizationId } from '../api/client.js';

export const AuthContext = createContext(null);

// Estado de autenticação da aplicação inteira. Fica num provider (ver
// AuthProvider.jsx) para não repetir a chamada de organizações em cada tela.
export function useAuthState() {
  const [session, setSession] = useState(null);
  const [organizations, setOrganizations] = useState(null); // null = carregando
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!session) {
      setOrganizations(null);
      return [];
    }
    try {
      const { data } = await api.get('/api/onboarding/me/organizations');
      setOrganizations(data);
      return data;
    } catch {
      setOrganizations([]);
      return [];
    }
  }, [session]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });

  const signOut = async () => {
    setCurrentOrganizationId(null);
    setOrganizations(null);
    await supabase.auth.signOut();
  };

  // Cria o usuário e, em seguida, a organização com trial de 3 dias.
  // Se o projeto do Supabase exigir confirmação de e-mail, não existe sessão
  // ainda — nesse caso a organização é criada no primeiro login.
  const signUp = async ({ email, password, name, organizationName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, organization_name: organizationName } },
    });
    if (error) return { error };
    if (!data.session) return { needsEmailConfirmation: true };

    try {
      const { data: result } = await api.post('/api/onboarding/bootstrap', {
        organizationName,
        name,
      });
      await loadOrganizations();
      return { organization: result.organization };
    } catch (err) {
      return { error: new Error(err.response?.data?.error || 'Falha ao criar a organização') };
    }
  };

  const bootstrapOrganization = async ({ organizationName, name }) => {
    const { data } = await api.post('/api/onboarding/bootstrap', { organizationName, name });
    await loadOrganizations();
    return data.organization;
  };

  return {
    session,
    organizations,
    loading,
    signIn,
    signUp,
    signOut,
    loadOrganizations,
    bootstrapOrganization,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
