import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Contacts() {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [newStageName, setNewStageName] = useState('');

  useEffect(() => {
    loadStages();
    loadContacts();
  }, []);

  async function loadStages() {
    const { data } = await api.get('/api/funnel-stages');
    setStages(data);
  }

  async function loadContacts() {
    const { data } = await api.get('/api/contacts');
    setContacts(data);
  }

  async function addStage() {
    if (!newStageName.trim()) return;
    await api.post('/api/funnel-stages', { name: newStageName, position: stages.length });
    setNewStageName('');
    await loadStages();
  }

  async function moveContact(contactId, stageId) {
    await api.patch(`/api/contacts/${contactId}`, { funnel_stage_id: stageId });
    await loadContacts();
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">CRM — Funil de vendas</h2>
        <div className="flex gap-2">
          <input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Novo estágio (ex: Negociação)"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button onClick={addStage} className="bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm">
            Adicionar estágio
          </button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        <StageColumn
          stage={{ id: null, name: 'Sem estágio' }}
          contacts={contacts.filter((c) => !c.funnel_stage_id)}
          onDrop={moveContact}
        />
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            contacts={contacts.filter((c) => c.funnel_stage_id === stage.id)}
            onDrop={moveContact}
          />
        ))}
      </div>
    </div>
  );
}

function StageColumn({ stage, contacts, onDrop }) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const contactId = e.dataTransfer.getData('contactId');
        onDrop(contactId, stage.id);
      }}
      className="bg-white rounded-xl border border-slate-200 w-64 flex-shrink-0 flex flex-col"
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{stage.name}</p>
        <span className="text-xs text-slate-400">{contacts.length}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[120px]">
        {contacts.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('contactId', c.id)}
            className="bg-slate-50 border border-slate-200 rounded-lg p-2 cursor-move"
          >
            <p className="text-sm font-medium text-slate-800">{c.name || c.phone}</p>
            <p className="text-xs text-slate-500">{c.phone}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {(c.contact_tags || []).map((t) => (
                <span
                  key={t.tag_id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: t.tags?.color || '#10b981' }}
                >
                  {t.tags?.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
