import { Router } from 'express';
import { supabase } from '../db/supabase.js';

export const agentsRouter = Router();

// Lista atendentes da organização (para transferência de conversa, etc.)
agentsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, email, role, status, avatar_url')
      .eq('organization_id', req.agent.organization_id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch('/me/status', async (req, res, next) => {
  try {
    const { status } = req.body; // 'online' | 'offline' | 'away'
    const { data, error } = await supabase
      .from('agents')
      .update({ status })
      .eq('id', req.agent.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

agentsRouter.get('/me', async (req, res) => {
  res.json(req.agent);
});
