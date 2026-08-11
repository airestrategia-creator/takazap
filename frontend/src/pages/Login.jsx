import { useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError('E-mail ou senha incorretos. Confira e tente de novo.');
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-lg shadow-slate-200/60 rounded-2xl p-8 w-full max-w-sm space-y-5 border border-slate-100">
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-lg mx-auto mb-3">
            W
          </div>
          <h1 className="text-lg font-semibold text-slate-800">WhatsZap Flow</h1>
          <p className="text-sm text-slate-500 mt-1">Entre com sua conta de atendente</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              required
              autoFocus
            />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              required
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
