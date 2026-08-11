import { supabase } from '../db/supabase.js';

/**
 * Isolamento entre organizações.
 *
 * O backend usa a service_role key, que IGNORA o RLS do Postgres. Ou seja: o
 * banco não protege nada aqui — quem tem que garantir que um cliente não
 * enxergue os dados de outro é este código. Toda rota que recebe um id pela
 * URL precisa passar por aqui antes de tocar no registro.
 */

export class NotFoundError extends Error {
  constructor(message = 'Registro não encontrado') {
    super(message);
    this.status = 404;
  }
}

/**
 * Carrega um registro garantindo que ele pertence à organização do usuário.
 * Devolve 404 (e não 403) de propósito: responder "existe, mas não é seu"
 * confirmaria para um atacante que aquele id existe em outra conta.
 */
export async function findOwned(table, id, organizationId, columns = '*') {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError();
  return data;
}

/** Igual ao findOwned, mas para tabelas ligadas à org por outra tabela. */
export async function findOwnedVia(table, id, parentTable, parentKey, organizationId, columns = '*') {
  const { data, error } = await supabase
    .from(table)
    .select(`${columns}, ${parentTable}!inner(organization_id)`)
    .eq('id', id)
    .eq(`${parentTable}.organization_id`, organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError();
  return data;
}

/** Confere se um id informado no corpo do request é da própria organização. */
export async function assertOwned(table, id, organizationId) {
  if (!id) return null;
  return findOwned(table, id, organizationId, 'id');
}
