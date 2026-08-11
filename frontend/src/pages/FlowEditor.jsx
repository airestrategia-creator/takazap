import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, Loader2, AlertTriangle, Plus, Smartphone } from 'lucide-react';

import { api } from '../api/client.js';
import { useOrganization } from '../hooks/useOrganization.js';
import BlockNode from '../components/flow/BlockNode.jsx';
import NodeProperties from '../components/flow/NodeProperties.jsx';
import {
  NODE_TYPES, PALETTE, ACCENTS, newNodeId, toReactFlow, fromReactFlow, validateFlow,
} from '../lib/flowNodes.js';

const nodeTypes = { block: BlockNode };

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}

function FlowEditorInner() {
  const { flowId, orgId } = useParams();
  const navigate = useNavigate();
  const { orgId: contextOrgId } = useOrganization();
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef(null);

  const [flow, setFlow] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ data }, sessionsRes] = await Promise.all([
          api.get(`/api/flows/${flowId}`),
          api.get('/api/sessions').catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;

        const { nodes: rfNodes, edges: rfEdges } = toReactFlow(data.flow.definition);
        // Os contadores vêm separados do grafo para não sujarem o `definition`
        // salvo — o canvas só os exibe.
        setNodes(
          rfNodes.map((n) => ({ ...n, data: { ...n.data, stats: data.stats[n.id] } })),
        );
        setEdges(rfEdges);
        setFlow(data.flow);
        setDevices(Array.isArray(sessionsRes.data) ? sessionsRes.data : []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Não foi possível abrir o fluxo.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [flowId, setNodes, setEdges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const issues = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, label: params.sourceHandle || undefined }, eds)),
    [setEdges],
  );

  function addNode(kind, position) {
    const meta = NODE_TYPES[kind];
    const id = newNodeId();
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'block',
        position: position ?? { x: 120 + ns.length * 40, y: 80 + ns.length * 40 },
        data: { kind, fields: { ...meta.defaults } },
      },
    ]);
    setSelectedId(id);
  }

  function onDrop(event) {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/whatszap-node');
    if (!kind || !NODE_TYPES[kind]) return;
    addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function updateSelectedFields(fields) {
    setNodes((ns) =>
      ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, fields } } : n)),
    );
  }

  function deleteSelected() {
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/api/flows/${flowId}`, {
        name: flow.name,
        is_active: flow.is_active,
        trigger_type: flow.trigger_type,
        trigger_keywords: flow.trigger_keywords,
        device_scope: flow.device_scope,
        session_ids: flow.session_ids,
        definition: fromReactFlow(nodes, edges),
      });
      setFlow(data);
      setSavedAt(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !flow) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center">
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const basePath = `/org/${orgId || contextOrgId}`;

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`${basePath}/fluxos`)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-700"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>

        <input
          value={flow.name}
          onChange={(e) => setFlow((f) => ({ ...f, name: e.target.value }))}
          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        />

        <label className="flex items-center gap-2 text-sm text-slate-700 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={flow.is_active}
            onChange={(e) => setFlow((f) => ({ ...f, is_active: e.target.checked }))}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Ativo
        </label>

        {savedAt && !saving && (
          <span className="text-xs text-slate-400 shrink-0">
            Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Salvar
        </button>
      </header>

      {/* Gatilho e escopo de dispositivos */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-slate-400">GATILHO</p>
          <div className="mt-2 flex gap-2">
            <select
              value={flow.trigger_type}
              onChange={(e) => setFlow((f) => ({ ...f, trigger_type: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="keyword">Palavra-chave</option>
              <option value="first_message">Primeira mensagem</option>
              <option value="manual">Manual</option>
            </select>
            {flow.trigger_type === 'keyword' && (
              <input
                value={(flow.trigger_keywords || []).join(', ')}
                onChange={(e) =>
                  setFlow((f) => ({
                    ...f,
                    trigger_keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="orçamento, preço, valor"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            )}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Smartphone size={12} />
            DISPOSITIVOS DESTA AUTOMAÇÃO
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={flow.device_scope !== 'selected'}
                onChange={() => setFlow((f) => ({ ...f, device_scope: 'all' }))}
                className="text-brand-600 focus:ring-brand-500/30"
              />
              Todos os dispositivos
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={flow.device_scope === 'selected'}
                onChange={() => setFlow((f) => ({ ...f, device_scope: 'selected' }))}
                className="text-brand-600 focus:ring-brand-500/30"
              />
              Somente selecionados
            </label>
          </div>
          {flow.device_scope === 'selected' && (
            <div className="mt-2 flex flex-wrap gap-2">
              {devices.length === 0 && (
                <span className="text-xs text-slate-400">Nenhum dispositivo conectado.</span>
              )}
              {devices.map((d) => {
                const on = (flow.session_ids || []).includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() =>
                      setFlow((f) => ({
                        ...f,
                        session_ids: on
                          ? f.session_ids.filter((id) => id !== d.id)
                          : [...(f.session_ids || []), d.id],
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs ring-1 transition ${
                      on
                        ? 'bg-brand-50 text-brand-700 ring-brand-200'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-200'
                    }`}
                  >
                    {d.label || d.phone_number || 'Dispositivo'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 bg-rose-50 border-b border-rose-100 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 flex min-h-0">
        {/* Paleta */}
        <aside className="w-48 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-2">
          <p className="px-1 py-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
            BLOCOS
          </p>
          {PALETTE.map((kind) => {
            const meta = NODE_TYPES[kind];
            const accent = ACCENTS[meta.accent];
            return (
              <button
                key={kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/whatszap-node', kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addNode(kind)}
                title={meta.hint}
                className="w-full mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-grab active:cursor-grabbing"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} />
                <span className="flex-1 truncate">{meta.label}</span>
                <Plus size={12} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
          <p className="px-1 mt-2 text-[10px] text-slate-400 leading-relaxed">
            Arraste para o canvas ou clique para adicionar.
          </p>
        </aside>

        {/* Grafo */}
        <div
          ref={canvasRef}
          className="flex-1 min-w-0 bg-slate-50"
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} color="#cbd5e1" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-white" />
          </ReactFlow>
        </div>

        {/* Propriedades */}
        <aside className="w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          <NodeProperties
            node={selectedNode}
            onChange={updateSelectedFields}
            onDelete={deleteSelected}
          />

          {issues.length > 0 && (
            <div className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                Revise antes de ativar
              </p>
              <ul className="mt-2 space-y-1">
                {issues.map((issue, i) => (
                  <li key={i} className="text-[11px] text-amber-800/90 leading-relaxed">
                    • {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
