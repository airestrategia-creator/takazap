// Catálogo de planos, add-ons e limites.
// Espelha frontend/src/lib/plans.js — os ids precisam bater com o check
// constraint de `subscriptions.plan_id` no banco.

export const TRIAL_DAYS = 3;
export const TRIAL_BROADCAST_LIMIT = 50;
export const ADDON_PRICE_CENTS = 990;
export const EXTRA_DEVICE_PRICE_CENTS = 990;
export const MAX_DEVICES_SELF_SERVE = 10;

export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Período de testes',
    priceCents: 0,
    limits: { devices: 1, members: 1, inbox: true, kanban: true },
  },
  inicial: {
    id: 'inicial',
    name: 'Inicial',
    priceCents: 2990,
    limits: { devices: 1, members: 1, inbox: false, kanban: false },
  },
  completo: {
    id: 'completo',
    name: 'Completo',
    priceCents: 4490,
    limits: { devices: 1, members: 1, inbox: true, kanban: true },
  },
  completo_equipe: {
    id: 'completo_equipe',
    name: 'Completo + Equipe',
    priceCents: 5990,
    limits: { devices: 1, members: 5, inbox: true, kanban: true },
  },
};

export const ADDON_KEYS = ['addon_proxy', 'addon_privacidade'];

export function getPlan(planId) {
  return PLANS[planId] || PLANS.trial;
}

// Quanto essa assinatura custa por mês, já com dispositivos extras e add-ons.
export function calculateAmountCents(subscription) {
  const plan = getPlan(subscription.plan_id);
  if (plan.priceCents === 0) return 0;

  const addons = ADDON_KEYS.filter((k) => subscription[k]).length;
  return (
    plan.priceCents +
    (subscription.extra_devices || 0) * EXTRA_DEVICE_PRICE_CENTS +
    addons * ADDON_PRICE_CENTS
  );
}

// Limites efetivos: o plano define a base, os add-ons somam por cima.
export function effectiveLimits(subscription) {
  const plan = getPlan(subscription.plan_id);
  return {
    ...plan.limits,
    devices: plan.limits.devices + (subscription.extra_devices || 0),
    proxy: !!subscription.addon_proxy,
    privacidade: !!subscription.addon_privacidade,
  };
}

// A assinatura ainda dá acesso ao produto?
export function isActive(subscription) {
  if (!subscription) return false;
  if (subscription.status === 'active') {
    return !subscription.current_period_end || new Date(subscription.current_period_end) > new Date();
  }
  if (subscription.status === 'trialing') {
    return !subscription.trial_ends_at || new Date(subscription.trial_ends_at) > new Date();
  }
  return false;
}

export function isTrial(subscription) {
  return subscription?.status === 'trialing';
}
