import { useRef, useState } from 'react';
import { X, Loader2, Building2, Upload, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';

const CORES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];
const LIMITE_KB = 150;

export default function EditarEmpresa({ empresa, sessoes, onClose, onSalvo }) {
  const [form, setForm] = useState({
    name: empresa.name || '',
    document: empresa.document || '',
    color: empresa.color || CORES[0],
    session_id: empresa.session_id || '',
    logo_url: empresa.logo_url || '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef(null);

  function escolherLogo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro('');

    if (!arquivo.type.startsWith('image/')) {
      return setErro('Escolha um arquivo de imagem.');
    }
    // Checamos o tamanho antes de ler: um arquivo de 5 MB viraria ~6,7 MB em
    // base64 e travaria a aba antes mesmo de chegar ao servidor.
    if (arquivo.size > LIMITE_KB * 1024) {
      return setErro(`A imagem tem ${Math.round(arquivo.size / 1024)} KB. O limite é ${LIMITE_KB} KB.`);
    }

    const leitor = new FileReader();
    leitor.onload = () => setForm((f) => ({ ...f, logo_url: leitor.result }));
    leitor.onerror = () => setErro('Não consegui ler esse arquivo.');
    leitor.readAsDataURL(arquivo);
  }

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.patch(`/api/companies/${empresa.id}`, {
        name: form.name.trim(),
        document: form.document.trim() || null,
        color: form.color,
        session_id: form.session_id || null,
        logo_url: form.logo_url || null,
      });
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <form
          onSubmit={salvar}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 pointer-events-auto max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Editar empresa</h3>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white shrink-0 overflow-hidden"
              style={{ backgroundColor: form.logo_url ? '#fff' : form.color }}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <Building2 size={26} />
              )}
            </span>

            <div className="space-y-1.5">
              <input
                ref={inputArquivo}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={escolherLogo}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputArquivo.current?.click()}
                className="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5"
              >
                <Upload size={14} /> {form.logo_url ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {form.logo_url && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, logo_url: '' })}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 size={11} /> Remover
                </button>
              )}
              <p className="text-[11px] text-slate-400">PNG, JPG, WEBP ou SVG · até {LIMITE_KB} KB</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500">Nome *</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">CNPJ</span>
            <input
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
              placeholder="00.000.000/0001-00"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Número de WhatsApp</span>
            <select
              value={form.session_id}
              onChange={(e) => setForm({ ...form, session_id: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Usar qualquer número</option>
              {sessoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} {s.phone_number ? `(${s.phone_number})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-xs text-slate-500">Cor</span>
            <div className="flex items-center gap-2 mt-1.5">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setForm({ ...form, color: cor })}
                  className={`w-6 h-6 rounded-full transition ${
                    form.color === cor ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                  }`}
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              A cor identifica a empresa nos cards do Kanban quando não há logo.
            </p>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-300 hover:bg-slate-50 rounded-lg py-2.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
            >
              {salvando && <Loader2 size={15} className="animate-spin" />}
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
