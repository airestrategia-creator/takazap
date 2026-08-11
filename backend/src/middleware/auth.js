import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';

// Valida o JWT do Supabase Auth e coloca o usuário em req.user.
// Não exige que o usuário já pertença a uma organização — é o que o cadastro
// (onboarding) precisa, já que nesse momento a org ainda não existe.
export async function requireUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente' });
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    next(err);
  }
}

// Resolve em qual organização o usuário está agindo.
// O painel manda a org da URL no header `x-organization-id`; sem ele, cai na
// organização mais antiga do usuário.
export async function requireAgent(req, res, next) {
  try {
    const orgId = req.headers['x-organization-id'];

    let query = supabase
      .from('agents')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (orgId) query = query.eq('organization_id', orgId);

    const { data: agents, error } = await query.limit(1);
    if (error) throw error;

    const agent = agents?.[0];
    if (!agent) {
      return res.status(403).json({
        error: orgId
          ? 'Você não tem acesso a esta organização'
          : 'Usuário não pertence a nenhuma organização',
        code: 'NO_MEMBERSHIP',
      });
    }

    req.agent = agent;
    req.organizationId = agent.organization_id;
    next();
  } catch (err) {
    next(err);
  }
}

// Exige um papel mínimo. owner > admin > agent.
const ROLE_RANK = { agent: 0, admin: 1, owner: 2 };

export function requireRole(minRole) {
  return (req, res, next) => {
    const rank = ROLE_RANK[req.agent?.role] ?? -1;
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: 'Você não tem permissão para esta ação',
        code: 'FORBIDDEN_ROLE',
      });
    }
    next();
  };
}

export function signInternalToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}
