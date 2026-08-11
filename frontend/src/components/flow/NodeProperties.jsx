import { Trash2, Plus, X } from 'lucide-react';
import { NODE_TYPES } from '../../lib/flowNodes.js';

export default function NodeProperties({ node, onChange, onDelete }) {
  if (!node) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-slate-800">Propriedades</h3>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          Clique em um bloco no canvas para editar. Arraste da bolinha da direita até a bolinha da
          esquerda de outro bloco para conectar. Na Condição, cada caminho tem sua própria saída.
        </p>
      </div>
    );
  }

  const meta = NODE_TYPES[node.data.kind] ?? {};
  const fields = node.data.fields ?? {};
  const set = (key, value) => onChange({ ...fields, [key]: value });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{meta.hint}</p>
        </div>
        <button
          onClick={onDelete}
          title="Excluir bloco"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {node.data.kind === 'message' && (
        <>
          <Textarea
            label="Texto da mensagem"
            value={fields.text || ''}
            onChange={(v) => set('text', v)}
            hint="Use {{nome}}, {{telefone}} ou qualquer variável coletada no fluxo."
          />
          <Checkbox
            label="Esperar o contato responder antes de seguir"
            checked={fields.waitForReply !== false}
            onChange={(v) => set('waitForReply', v)}
          />
        </>
      )}

      {node.data.kind === 'wait_reply' && (
        <Input
          label="Guardar a resposta como"
          value={fields.saveAs || 'resposta'}
          onChange={(v) => set('saveAs', v)}
          hint="Depois você usa como {{resposta}} nas mensagens seguintes."
        />
      )}

      {node.data.kind === 'condition' && (
        <BranchEditor branches={fields.branches ?? []} onChange={(b) => set('branches', b)} />
      )}

      {node.data.kind === 'add_tag' && (
        <Input
          label="Nome da tag"
          value={fields.tagName || ''}
          onChange={(v) => set('tagName', v)}
          hint="Se a tag não existir, ela é criada."
        />
      )}

      {node.data.kind === 'set_stage' && (
        <Input
          label="Etapa do funil"
          value={fields.stageName || ''}
          onChange={(v) => set('stageName', v)}
          hint="Precisa ser o nome exato de uma etapa do seu Kanban."
        />
      )}

      {node.data.kind === 'delay' && (
        <Input
          type="number"
          label="Segundos de espera"
          value={fields.seconds ?? 5}
          onChange={(v) => set('seconds', Number(v))}
          hint="Máximo de 60s — acima disso o fluxo seguiria segurando a conexão."
        />
      )}

      {node.data.kind === 'http' && (
        <>
          <Select
            label="Método"
            value={fields.method || 'GET'}
            options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}
            onChange={(v) => set('method', v)}
          />
          <Input label="URL" value={fields.url || ''} onChange={(v) => set('url', v)} />
          {!['GET', 'HEAD'].includes(fields.method || 'GET') && (
            <Textarea
              label="Corpo (JSON)"
              value={fields.body || ''}
              onChange={(v) => set('body', v)}
              hint="Pode usar variáveis: {&quot;telefone&quot;: &quot;{{telefone}}&quot;}"
            />
          )}
          <Input
            label="Guardar resposta como"
            value={fields.saveAs || 'http'}
            onChange={(v) => set('saveAs', v)}
            hint="Acesse campos com ponto: {{http.data.nome}}"
          />
        </>
      )}

      {node.data.kind === 'handoff' && (
        <Textarea
          label="Mensagem antes de transferir"
          value={fields.text || ''}
          onChange={(v) => set('text', v)}
          hint="Deixe vazio para transferir sem avisar."
        />
      )}

      {node.data.kind === 'end' && (
        <p className="text-xs text-slate-500">Este bloco encerra o fluxo. Não tem configuração.</p>
      )}
    </div>
  );
}

function BranchEditor({ branches, onChange }) {
  const update = (i, patch) =>
    onChange(branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-700">Caminhos</label>
        <button
          onClick={() => onChange([...branches, { label: `opção ${branches.length + 1}`, equalsAny: [] }])}
          className="inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800"
        >
          <Plus size={13} />
          Adicionar
        </button>
      </div>

      {branches.length === 0 && (
        <p className="text-xs text-slate-400">Sem caminhos. Tudo segue pela saída "padrão".</p>
      )}

      {branches.map((b, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={b.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="nome do caminho"
              className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
            <button
              onClick={() => onChange(branches.filter((_, idx) => idx !== i))}
              className="p-1 text-slate-400 hover:text-rose-600"
              title="Remover caminho"
            >
              <X size={14} />
            </button>
          </div>
          <input
            value={(b.equalsAny || []).join(', ')}
            onChange={(e) =>
              update(i, {
                equalsAny: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="palavras separadas por vírgula"
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
      ))}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        A resposta do contato é comparada com essas palavras. O primeiro caminho que bater é o
        seguido; se nenhum bater, vai pela saída "padrão".
      </p>
    </div>
  );
}

function Input({ label, hint, type = 'text', value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">{hint}</span>}
    </label>
  );
}

function Textarea({ label, hint, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">{hint}</span>}
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
      />
      <span className="text-xs text-slate-700 leading-relaxed">{label}</span>
    </label>
  );
}
