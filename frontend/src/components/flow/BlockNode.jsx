import { Handle, Position } from '@xyflow/react';
import {
  MessageSquare, Split, Tag, Timer, Globe, UserCheck, CircleStop, Ear, Move,
} from 'lucide-react';
import { NODE_TYPES, ACCENTS } from '../../lib/flowNodes.js';

const ICONS = {
  message: MessageSquare,
  wait_reply: Ear,
  condition: Split,
  add_tag: Tag,
  set_stage: Move,
  delay: Timer,
  http: Globe,
  handoff: UserCheck,
  end: CircleStop,
};

export default function BlockNode({ id, data, selected }) {
  const meta = NODE_TYPES[data.kind] ?? NODE_TYPES.message;
  const accent = ACCENTS[meta.accent] ?? ACCENTS.slate;
  const Icon = ICONS[data.kind] ?? MessageSquare;
  const stats = data.stats;
  const isCondition = data.kind === 'condition';
  const isTerminal = data.kind === 'end' || data.kind === 'handoff';
  const branches = isCondition ? data.fields?.branches ?? [] : [];

  return (
    <div
      className={`w-60 rounded-xl bg-white border shadow-sm transition-shadow ${
        selected ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200'
      }`}
    >
      {/* Entrada: todo bloco recebe conexão, menos quando é o início do fluxo */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-slate-300 !border-2 !border-white"
      />

      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center ring-1 ${accent.chip}`}>
          <Icon size={13} />
        </span>
        <span className="text-xs font-semibold text-slate-800 flex-1 truncate">{meta.label}</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-500 leading-snug line-clamp-3 min-h-[1.5rem]">
          {summarize(data.kind, data.fields)}
        </p>
      </div>

      {stats && (stats.ok_count || stats.warn_count || stats.error_count) ? (
        <div className="px-3 pb-2 flex gap-2 text-[10px]">
          <span className="text-emerald-600">{stats.ok_count} ok</span>
          <span className="text-amber-600">{stats.warn_count} alerta</span>
          <span className="text-rose-600">{stats.error_count} erro</span>
        </div>
      ) : null}

      {/* Saídas. Condição tem uma porta por caminho; os demais têm uma só. */}
      {isCondition ? (
        <div className="border-t border-slate-100 py-1">
          {branches.map((b, i) => (
            <div key={b.label || i} className="relative px-3 py-1 text-[11px] text-slate-600">
              {b.label}
              <Handle
                id={b.label}
                type="source"
                position={Position.Right}
                style={{ top: '50%' }}
                className={`!w-2.5 !h-2.5 !border-2 !border-white ${
                  i === 0 ? '!bg-sky-500' : '!bg-rose-500'
                }`}
              />
            </div>
          ))}
          <div className="relative px-3 py-1 text-[11px] text-slate-400">
            padrão
            <Handle
              type="source"
              position={Position.Right}
              style={{ top: '50%' }}
              className="!w-2.5 !h-2.5 !bg-slate-300 !border-2 !border-white"
            />
          </div>
        </div>
      ) : (
        !isTerminal && (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-2.5 !h-2.5 !bg-brand-500 !border-2 !border-white"
          />
        )
      )}
    </div>
  );
}

function summarize(kind, fields = {}) {
  switch (kind) {
    case 'message':
      return fields.text || 'Sem texto definido';
    case 'wait_reply':
      return `Guarda a resposta em {{${fields.saveAs || 'resposta'}}}`;
    case 'condition':
      return (fields.branches ?? [])
        .map((b) => `${b.label}: ${(b.equalsAny || []).join(', ')}`)
        .join(' · ') || 'Sem caminhos definidos';
    case 'add_tag':
      return fields.tagName ? `Tag "${fields.tagName}"` : 'Sem tag definida';
    case 'set_stage':
      return fields.stageName ? `Move para "${fields.stageName}"` : 'Sem etapa definida';
    case 'delay':
      return `Espera ${fields.seconds || 0}s`;
    case 'http':
      return fields.url ? `${fields.method || 'GET'} ${fields.url}` : 'Sem URL definida';
    case 'handoff':
      return fields.text || 'Transfere para atendimento humano';
    case 'end':
      return 'Fim do fluxo';
    default:
      return '';
  }
}
