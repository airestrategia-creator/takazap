// Catálogo dos blocos do editor de fluxo.
// `type` é o mesmo valor que o motor (backend/src/engine/flowEngine.js) espera
// em cada nó — não mude sem mudar lá também.

export const NODE_TYPES = {
  message: {
    type: 'message',
    label: 'Mensagem',
    hint: 'Envia um texto para o contato',
    accent: 'brand',
    defaults: { text: 'Olá {{nome}}! Como posso ajudar?', waitForReply: true },
  },
  wait_reply: {
    type: 'wait_reply',
    label: 'Aguardar resposta',
    hint: 'Pausa até o contato responder',
    accent: 'sky',
    defaults: { saveAs: 'resposta' },
  },
  condition: {
    type: 'condition',
    label: 'Condição',
    hint: 'Segue caminhos diferentes conforme a resposta',
    accent: 'amber',
    defaults: {
      branches: [
        { label: 'sim', equalsAny: ['sim', 'quero', 'pode'] },
        { label: 'não', equalsAny: ['não', 'nao', 'depois'] },
      ],
    },
  },
  add_tag: {
    type: 'add_tag',
    label: 'Ação · tag',
    hint: 'Marca o contato com uma tag',
    accent: 'violet',
    defaults: { tagName: '' },
  },
  set_stage: {
    type: 'set_stage',
    label: 'Mover no funil',
    hint: 'Muda o contato de etapa no Kanban',
    accent: 'violet',
    defaults: { stageName: '' },
  },
  delay: {
    type: 'delay',
    label: 'Espera',
    hint: 'Aguarda alguns segundos antes de seguir',
    accent: 'slate',
    defaults: { seconds: 5 },
  },
  http: {
    type: 'http',
    label: 'HTTP (API JSON)',
    hint: 'Chama uma API e guarda a resposta',
    accent: 'emerald',
    defaults: { url: '', method: 'GET', body: '', saveAs: 'http' },
  },
  handoff: {
    type: 'handoff',
    label: 'Passar para humano',
    hint: 'Desliga o bot e chama um atendente',
    accent: 'rose',
    defaults: { text: 'Vou te transferir para um atendente. Um instante!' },
  },
  end: {
    type: 'end',
    label: 'Encerrar',
    hint: 'Termina o fluxo',
    accent: 'slate',
    defaults: {},
  },
};

// Ordem da paleta lateral
export const PALETTE = [
  'message',
  'wait_reply',
  'condition',
  'add_tag',
  'set_stage',
  'delay',
  'http',
  'handoff',
  'end',
];

export const ACCENTS = {
  brand: { dot: 'bg-brand-500', chip: 'bg-brand-50 text-brand-700 ring-brand-100' },
  sky: { dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-100' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
  violet: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-100' },
  emerald: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  rose: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-100' },
  slate: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export function newNodeId() {
  return `n_${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Conversão entre o formato do motor e o do React Flow ----
//
// Motor:      { nodes: [{ id, type, data, position }], edges: [{ from, to, condition }] }
// React Flow: { nodes: [{ id, type:'block', position, data }], edges: [{ id, source, target, label }] }

export function toReactFlow(definition) {
  const nodes = (definition?.nodes ?? []).map((n, i) => ({
    id: n.id,
    type: 'block',
    position: n.position ?? { x: 80, y: 60 + i * 130 },
    data: { kind: n.type, fields: n.data ?? {} },
  }));

  const edges = (definition?.edges ?? []).map((e, i) => ({
    id: `e_${i}_${e.from}_${e.to}`,
    source: e.from,
    target: e.to,
    sourceHandle: e.condition || null,
    label: e.condition || undefined,
  }));

  return { nodes, edges };
}

export function fromReactFlow(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: n.data.fields ?? {},
      position: n.position,
    })),
    edges: edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(e.sourceHandle ? { condition: e.sourceHandle } : {}),
    })),
  };
}

// Problemas que só aparecem quando um cliente real cai no fluxo — melhor
// avisar no editor.
export function validateFlow(nodes, edges) {
  const issues = [];
  if (!nodes.length) return issues;

  const targets = new Set(edges.map((e) => e.target));
  const sources = new Set(edges.map((e) => e.source));

  const starts = nodes.filter((n) => !targets.has(n.id));
  if (starts.length === 0) {
    issues.push('Nenhum bloco de início: todos os blocos recebem uma conexão, então o fluxo nunca começa.');
  } else if (starts.length > 1) {
    issues.push(`${starts.length} blocos sem conexão de entrada — só o primeiro será usado como início.`);
  }

  for (const node of nodes) {
    const { kind, fields } = node.data;

    if (kind === 'condition') {
      const labels = (fields.branches ?? []).map((b) => b.label);
      const wired = edges.filter((e) => e.source === node.id).map((e) => e.sourceHandle);
      const missing = labels.filter((l) => !wired.includes(l));
      if (missing.length) {
        issues.push(`Condição sem saída ligada para: ${missing.join(', ')}.`);
      }
    }

    if (kind === 'http' && !fields.url) {
      issues.push('Um bloco HTTP está sem URL.');
    }

    if (kind === 'add_tag' && !fields.tagName) {
      issues.push('Um bloco de tag está sem o nome da tag.');
    }

    const terminal = kind === 'end' || kind === 'handoff';
    if (!terminal && !sources.has(node.id)) {
      issues.push(`O bloco "${NODE_TYPES[kind]?.label || kind}" não leva a lugar nenhum.`);
    }
  }

  return issues;
}
