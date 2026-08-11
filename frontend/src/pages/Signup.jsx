import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Lock, Mail, User, Building2, ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { getPlan, TRIAL_DAYS } from '../lib/plans.js';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const chosenPlan = getPlan(params.get('plano'));

  const [form, setForm] = useState({
    name: '',
    organizationName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    const result = await signUp(form);
    setLoading(false);

    if (result.error) {
      setError(
        result.error.message?.includes('already registered')
          ? 'Já existe uma conta com esse e-mail. Tente entrar.'
          : result.error.message || 'Não foi possível criar a conta.',
      );
      return;
    }

    if (result.needsEmailConfirmation) {
      setEmailSent(true);
      return;
    }

    navigate(`/org/${result.organization.id}/inicio`, { replace: true });
  }

  if (emailSent) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto ring-1 ring-brand-100">
            <MailCheck size={22} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Confirme seu e-mail</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Enviamos um link de confirmação para <strong>{form.email}</strong>. Depois de
            confirmar, entre no painel e a gente termina de montar sua organização.
          </p>
          <Link
            to="/entrar"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Ir para o login
            <ArrowRight size={15} />
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-lg mx-auto mb-3 shadow-sm shadow-brand-200">
            W
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Criar sua conta</h1>
          <p className="text-sm text-slate-500 mt-1">
            {TRIAL_DAYS} dias grátis, sem cartão de crédito
          </p>
          {chosenPlan && (
            <p className="mt-2 inline-block text-xs text-brand-700 bg-brand-50 ring-1 ring-brand-100 rounded-full px-2.5 py-1">
              Plano escolhido: {chosenPlan.name}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Field icon={User} placeholder="Seu nome" value={form.name} onChange={set('name')} autoFocus required />
          <Field
            icon={Building2}
            placeholder="Nome da sua empresa"
            value={form.organizationName}
            onChange={set('organizationName')}
            required
          />
          <Field
            icon={Mail}
            type="email"
            placeholder="E-mail"
            value={form.email}
            onChange={set('email')}
            required
          />
          <Field
            icon={Lock}
            type="password"
            placeholder="Senha (mínimo 8 caracteres)"
            value={form.password}
            onChange={set('password')}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? 'Criando sua conta...' : 'Criar conta grátis'}
        </button>

        <p className="text-center text-sm text-slate-500">
          Já tem conta?{' '}
          <Link to="/entrar" className="text-brand-700 font-medium hover:text-brand-800">
            Entrar
          </Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-10">
      <div className="bg-white shadow-xl shadow-brand-100/60 rounded-2xl p-8 w-full max-w-sm border border-slate-100">
        {children}
      </div>
    </div>
  );
}

function Field({ icon: Icon, ...props }) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        {...props}
        className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
      />
    </div>
  );
}
