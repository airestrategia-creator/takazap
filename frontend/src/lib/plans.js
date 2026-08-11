// Catálogo de planos e add-ons.
// Os mesmos ids são usados no backend (tabela `subscriptions`) para enforcement
// de limites — se mudar um id aqui, mude lá também.

export const PLANS = [
  {
    id: 'inicial',
    name: 'Inicial',
    priceCents: 2990,
    limits: { devices: 1, members: 1, inbox: false, kanban: false },
    features: [
      'Fluxos visuais ilimitados',
      'Automações e integrações',
      'Disparos em massa',
      '1 dispositivo incluso',
    ],
  },
  {
    id: 'completo',
    name: 'Completo',
    priceCents: 4490,
    highlight: true,
    limits: { devices: 1, members: 1, inbox: true, kanban: true },
    features: [
      'Tudo do Inicial',
      'Inbox com todas as conversas',
      'Kanban de vendas',
      '1 dispositivo incluso',
    ],
  },
  {
    id: 'completo_equipe',
    name: 'Completo + Equipe',
    priceCents: 5990,
    limits: { devices: 1, members: 5, inbox: true, kanban: true },
    features: [
      'Tudo do Completo',
      'Até 5 membros na equipe',
      'Papéis e permissões',
      '1 dispositivo incluso',
    ],
  },
];

export const ADDONS = [
  {
    id: 'device_extra',
    name: 'Dispositivo extra',
    priceCents: 990,
    text: 'Mais um número de WhatsApp na organização.',
  },
  {
    id: 'proxy',
    name: 'Proxy anti-queda',
    priceCents: 990,
    text: 'Menos desconexões do WhatsApp na operação.',
  },
  {
    id: 'privacidade',
    name: 'Privacidade do número',
    priceCents: 990,
    text: 'Rejeite ligações, controle vistos e presença.',
  },
];

export const TRIAL_DAYS = 3;

export function getPlan(id) {
  return PLANS.find((p) => p.id === id) || null;
}

export function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
