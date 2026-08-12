import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '../api/client.js';

// Duas telas em um arquivo só, porque são dois momentos do mesmo fluxo:
//   1. "pedir"    -> a pessoa digita o e-mail e recebe o link
//   2. "redefinir"-> a pessoa voltou pelo link do e-mail e escolhe a senha nova
//
// O Supabase avisa que a pessoa chegou pelo link disparando o evento
// PASSWORD_RECOVERY, e só nesse momento a sessão permite trocar a senha.
export default function RecuperarSenha() {
  const [modo, setModo] = useState('pedir');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // O link do e-mail volta com o token no fragmento da URL (#access_token=...).
    // O supabase-js consome esse fragmento sozinho e emite o evento abaixo.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setModo('redefinir');
    });
    if (window.location.hash.includes('type=recovery')) setModo('redefinir');
    return () => sub.subscription.unsubscribe();
  }, []);

  async function pedirLink(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/recuperar-senha`,
    });
    setCarregando(false);
    // Não revelamos se o e-mail existe: dizer "não encontrado" entregaria a
    // lista de quem tem conta para qualquer pessoa que tentasse adivinhar.
    if (error) setErro('Não conseguimos enviar agora. Tente de novo em instantes.');
    else setEnviado(true);
  }

  async function salvarSenha(e) {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== confirmacao) return setErro('As duas senhas não são iguais.');

    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      setErro(
        error.message?.includes('expired') || error.message?.includes('session')
          ? 'Esse link expirou. Peça um novo abaixo.'
          : 'Não foi possível salvar a senha. Peça um link novo e tente de novo.',
      );
      return;
    }
    setPronto(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <div className="bg-white shadow-lg shadow-slate-200/60 rounded-2xl p-8 w-full max-w-sm space-y-5 border border-slate-100">
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-lg mx-auto mb-3">
            T
          </div>
          <h1 className="text-lg font-semibold text-slate-800">TakaZap</h1>
          <p className="text-sm text-slate-500 mt-1">
            {modo === 'pedir' ? 'Recuperar acesso' : 'Escolha uma senha nova'}
          </p>
        </div>

        {pronto ? (
          <div className="text-center space-y-4">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600">Senha alterada. Já pode entrar com ela.</p>
            <Link
              to="/entrar"
              className="block w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 text-sm font-medium transition"
            >
              Ir para o login
            </Link>
          </div>
        ) : enviado ? (
          <div className="text-center space-y-4">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600 leading-relaxed">
              Se existir uma conta com <strong>{email}</strong>, o link de recuperação chegou lá.
              Vale olhar no spam.
            </p>
            <p className="text-xs text-slate-400">O link vale por 1 hora.</p>
            <Link to="/entrar" className="block text-sm text-brand-600 hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : modo === 'pedir' ? (
          <form onSubmit={pedirLink} className="space-y-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="Seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                required
                autoFocus
              />
            </div>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {carregando && <Loader2 size={16} className="animate-spin" />}
              {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>

            <Link to="/entrar" className="block text-center text-sm text-slate-500 hover:underline">
              Voltar para o login
            </Link>
          </form>
        ) : (
          <form onSubmit={salvarSenha} className="space-y-4">
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Nova senha (mínimo 8 caracteres)"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                required
                autoFocus
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Repita a nova senha"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                required
              />
            </div>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {carregando && <Loader2 size={16} className="animate-spin" />}
              {carregando ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            <button
              type="button"
              onClick={() => {
                setModo('pedir');
                setErro('');
              }}
              className="block w-full text-center text-sm text-slate-500 hover:underline"
            >
              Pedir um link novo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
