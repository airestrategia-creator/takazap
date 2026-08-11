import { useEffect, useState } from 'react';
import {
  Loader2, Check, Minus, Plus, ShieldCheck, Wifi, Smartphone,
  CalendarDays, Send, CircleCheck, Copy, AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useOrganization } from '../hooks/useOrganization.js';
import { PLANS, formatBRL } from '../lib/plans.js';

const ADDON_META = [
  {
    key: 'proxy',
    icon: Wifi,
    title: 'WhatsApp que não cai na operação',
    text: 'Proxy dedicado reduz desconexões do seu número.',
  },
  {
    key: 'privacidade',
    icon: ShieldCheck,
    title: 'Privacidade profissional no automático',
    text: 'Rejeite ligações, controle vistos azuis e fique sempre online.',
  },
];

export default function Subscription() {
  const { billing, agent, reload } = useOrganization();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const [copied, setCopied] = useState(false);

  const isOwner = agent?.role === 'owner';

  useEffect(() => {
    if (!billing?.subscription) return;
    const s = billing.subscription;
    setDraft({
      planId: s.plan_id === 'trial' ? 'completo' : s.plan_id,
      extraDevices: s.extra_devices,
      addons: {
        proxy: s.addon_proxy,
        privacidade: s.addon_privacidade,
      },
    });
  }, [billing?.subscription]);

  if (!billing || !draft) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  const { subscription, usage, limits } = billing;
  const maxDevices = billing.catalog?.maxDevicesSelfServe ?? 10;

  // Preço calculado no cliente só para dar feedback imediato — o valor que vale
  // é o que o backend grava ao salvar.
  const plan = PLANS.find((p) => p.id === draft.planId);
  const addonCount = Object.values(draft.addons).filter(Boolean).length;
  const previewCents =
    (plan?.priceCents || 0) + draft.extraDevices * 990 + addonCount * 990;

  async function save(patch) {
    if (!isOwner) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaving(true);
    setError('');
    try {
      await api.patch('/api/subscription', next);
      await reload();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar a assinatura.');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function checkout() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/api/subscription/checkout');
      setPayment(data.payment);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível gerar a cobrança.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmPayment() {
    setSaving(true);
    try {
      await api.post(`/api/subscription/payments/${payment.id}/confirm`);
      setPayment(null);
      await reload();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível confirmar o pagamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <header>
          <p className="text-xs font-semibold tracking-widest text-brand-600">ASSINATURA</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Escale sua operação com clareza total
          </h1>
          <p className="mt-2 text-slate-600">
            Monte plano, dispositivos e add-ons — o valor do PIX mensal atualiza na hora.
          </p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatusCard
            icon={CircleCheck}
            label="STATUS"
            value={STATUS_LABEL[subscription.status]}
            hint={billing.active ? 'WhatsApp liberado' : 'Acesso bloqueado'}
          />
          <StatusCard
            icon={CalendarDays}
            label="DATAS"
            value={formatDate(subscription.trial_ends_at)}
            hint={
              subscription.current_period_end
                ? `Pago até ${formatDate(subscription.current_period_end)}`
                : 'Pago até —'
            }
          />
          <StatusCard
            icon={Smartphone}
            label="DISPOSITIVOS"
            value={`${usage.devices} / ${limits.devices}`}
          />
          <StatusCard
            icon={Send}
            label={billing.trial ? 'DISPAROS NO TESTE' : 'MEMBROS'}
            value={
              billing.trial
                ? `${usage.trialBroadcastsUsed} / ${usage.trialBroadcastLimit}`
                : `${usage.members} / ${limits.members}`
            }
          />
        </div>

        {!isOwner && (
          <Notice tone="info">
            Só o dono da conta pode alterar a assinatura. Fale com quem criou a organização.
          </Notice>
        )}

        {billing.trial && !limits.inbox && (
          <Notice tone="warn">
            No plano Inicial o atendimento pelo Inbox some do menu. Se você usa o Inbox, escolha o
            plano Completo.
          </Notice>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        <section>
          <h2 className="text-xs font-semibold tracking-widest text-slate-400">ESCOLHA O PLANO</h2>
          <div className="mt-4 grid md:grid-cols-3 gap-3">
            {PLANS.map((p) => {
              const selected = draft.planId === p.id;
              return (
                <button
                  key={p.id}
                  disabled={!isOwner}
                  onClick={() => save({ planId: p.id })}
                  className={`text-left p-4 rounded-xl border transition ${
                    selected
                      ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/40'
                      : 'border-slate-200 hover:border-brand-200 bg-white'
                  } ${isOwner ? '' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    {selected && <Check size={16} className="text-brand-600" />}
                  </div>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                    {formatBRL(p.priceCents)}
                    <span className="text-sm font-normal text-slate-400">/mês</span>
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-1.5 text-xs text-slate-600">
                        <Check size={13} className="mt-0.5 shrink-0 text-brand-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Smartphone size={16} className="text-brand-600" />
              Dispositivos extras
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              1 incluso no plano. Cada extra: {formatBRL(990)}/mês. Acima de {maxDevices},
              fale com o suporte.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <StepperButton
                disabled={!isOwner || draft.extraDevices <= 0}
                onClick={() => save({ extraDevices: draft.extraDevices - 1 })}
              >
                <Minus size={16} />
              </StepperButton>
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">+{draft.extraDevices}</p>
                <p className="text-xs text-slate-400">dispositivos</p>
              </div>
              <StepperButton
                disabled={!isOwner || draft.extraDevices + 1 >= maxDevices}
                onClick={() => save({ extraDevices: draft.extraDevices + 1 })}
              >
                <Plus size={16} />
              </StepperButton>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">Potencialize o plano</h2>
            <p className="mt-1 text-xs text-slate-500">
              Ative só o que acelera sua operação — {formatBRL(990)}/mês cada.
            </p>
            <div className="mt-3 space-y-2">
              {ADDON_META.map((a) => {
                const on = draft.addons[a.key];
                const Icon = a.icon;
                return (
                  <div
                    key={a.key}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <button
                      role="switch"
                      aria-checked={on}
                      aria-label={a.title}
                      disabled={!isOwner}
                      onClick={() =>
                        save({ addons: { ...draft.addons, [a.key]: !on } })
                      }
                      className={`mt-0.5 w-10 h-6 rounded-full shrink-0 transition-colors relative ${
                        on ? 'bg-brand-600' : 'bg-slate-200'
                      } ${isOwner ? '' : 'opacity-60 cursor-not-allowed'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                          on ? 'left-[1.125rem]' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                        <Icon size={14} className="text-brand-600 shrink-0" />
                        {a.title}
                        <span className="text-brand-600">· +{formatBRL(990)}/mês</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{a.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-4">
            <p className="text-xs font-semibold tracking-widest text-slate-400">
              EXTRAS SELECIONADOS
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {addonCount === 0 && draft.extraDevices === 0
                ? 'Nenhum extra além do plano base.'
                : [
                    draft.extraDevices > 0 && `${draft.extraDevices} dispositivo(s) extra(s)`,
                    addonCount > 0 && `${addonCount} add-on(s)`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {formatBRL(previewCents)}
              <span className="text-sm font-normal text-slate-400">/mês</span>
            </p>
          </div>

          {isOwner && (
            <button
              onClick={checkout}
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl py-3 text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Gerar PIX de {formatBRL(previewCents)}
            </button>
          )}
        </section>

        {payment && (
          <section className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              PIX de {formatBRL(payment.amount_cents)}
            </h2>
            <p className="text-xs text-slate-600">
              Copie a chave abaixo e pague pelo app do banco. PIX confirmado libera o acesso na
              hora.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700">
                {payment.pix_payload}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(payment.pix_payload || '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-brand-300"
              >
                <Copy size={13} />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <button
              onClick={confirmPayment}
              disabled={saving}
              className="text-xs font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
            >
              Já paguei — confirmar e liberar acesso
            </button>
            <p className="text-[11px] text-slate-400">
              A confirmação é manual enquanto não há provedor de PIX plugado. Depois de integrar
              Mercado Pago ou Asaas, ela passa a ser automática por webhook.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL = {
  trialing: 'Período de testes',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  cancelled: 'Cancelada',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function StatusCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-brand-600">
        <Icon size={15} />
        <span className="text-[10px] font-semibold tracking-widest text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-lg font-bold text-slate-900 leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function StepperButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 flex items-center justify-center hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function Notice({ tone, children }) {
  const tones = {
    info: 'bg-slate-50 border-slate-200 text-slate-600',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`flex gap-2 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {tone !== 'info' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <p>{children}</p>
    </div>
  );
}
