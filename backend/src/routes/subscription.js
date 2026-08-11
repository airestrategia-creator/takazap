import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { requireRole } from '../middleware/auth.js';
import {
  PLANS,
  TRIAL_BROADCAST_LIMIT,
  MAX_DEVICES_SELF_SERVE,
  calculateAmountCents,
  effectiveLimits,
  isActive,
  isTrial,
} from '../lib/plans.js';
import { getPaymentProvider, isManualProvider } from '../services/payments.js';

export const subscriptionRouter = Router();

async function loadSubscription(organizationId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
  return data;
}

async function countDevices(organizationId) {
  const { count, error } = await supabase
    .from('whatsapp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (error) throw error;
  return count || 0;
}

async function countMembers(organizationId) {
  const { count, error } = await supabase
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (error) throw error;
  return count || 0;
}

// Estado da assinatura + uso atual. É o que o painel usa para esconder Inbox e
// Kanban fora do plano e para mostrar os avisos de upgrade.
subscriptionRouter.get('/', async (req, res, next) => {
  try {
    const subscription = await loadSubscription(req.organizationId);
    const [devices, members] = await Promise.all([
      countDevices(req.organizationId),
      countMembers(req.organizationId),
    ]);

    res.json({
      subscription,
      amountCents: calculateAmountCents(subscription),
      limits: effectiveLimits(subscription),
      active: isActive(subscription),
      trial: isTrial(subscription),
      usage: {
        devices,
        members,
        trialBroadcastsUsed: subscription.trial_broadcasts_used,
        trialBroadcastLimit: TRIAL_BROADCAST_LIMIT,
      },
      catalog: {
        plans: Object.values(PLANS).filter((p) => p.id !== 'trial'),
        maxDevicesSelfServe: MAX_DEVICES_SELF_SERVE,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Monta a assinatura (plano + dispositivos extras + add-ons). Só o owner mexe.
// Não libera acesso sozinho: quem libera é a confirmação do pagamento.
subscriptionRouter.patch('/', requireRole('owner'), async (req, res, next) => {
  try {
    const { planId, extraDevices, addons } = req.body;
    const patch = { updated_at: new Date().toISOString() };

    if (planId !== undefined) {
      if (!PLANS[planId] || planId === 'trial') {
        return res.status(400).json({ error: 'Plano inválido' });
      }
      patch.plan_id = planId;
    }

    if (extraDevices !== undefined) {
      const n = Number(extraDevices);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: 'Dispositivos extras inválidos' });
      }
      if (n + 1 > MAX_DEVICES_SELF_SERVE) {
        return res.status(400).json({
          error: `Acima de ${MAX_DEVICES_SELF_SERVE} dispositivos, fale com o suporte.`,
          code: 'DEVICE_LIMIT',
        });
      }
      patch.extra_devices = n;
    }

    if (addons) {
      for (const key of ['proxy', 'privacidade']) {
        if (addons[key] !== undefined) patch[`addon_${key}`] = !!addons[key];
      }
    }

    const current = await loadSubscription(req.organizationId);
    const merged = { ...current, ...patch };

    // Reduzir dispositivos abaixo do que já está conectado deixaria sessões
    // órfãs — melhor barrar e mandar desconectar antes.
    const limits = effectiveLimits(merged);
    const devices = await countDevices(req.organizationId);
    if (devices > limits.devices) {
      return res.status(409).json({
        error: `Você tem ${devices} dispositivo(s) conectado(s) e esse ajuste permite ${limits.devices}. Desconecte um dispositivo antes.`,
        code: 'DEVICES_IN_USE',
      });
    }

    const members = await countMembers(req.organizationId);
    if (members > limits.members) {
      return res.status(409).json({
        error: `Sua equipe tem ${members} membro(s) e esse plano permite ${limits.members}. Remova alguém antes.`,
        code: 'MEMBERS_IN_USE',
      });
    }

    patch.amount_cents = calculateAmountCents(merged);

    const { data, error } = await supabase
      .from('subscriptions')
      .update(patch)
      .eq('organization_id', req.organizationId)
      .select('*')
      .single();
    if (error) throw error;

    res.json({
      subscription: data,
      amountCents: calculateAmountCents(data),
      limits: effectiveLimits(data),
    });
  } catch (err) {
    next(err);
  }
});

// Gera a cobrança PIX do valor atual da assinatura.
subscriptionRouter.post('/checkout', requireRole('owner'), async (req, res, next) => {
  try {
    const subscription = await loadSubscription(req.organizationId);
    const amountCents = calculateAmountCents(subscription);

    if (amountCents <= 0) {
      return res.status(400).json({
        error: 'Escolha um plano antes de gerar a cobrança.',
        code: 'NO_PLAN',
      });
    }

    const provider = getPaymentProvider();
    const charge = await provider.createPixCharge({
      organizationId: req.organizationId,
      amountCents,
      description: `WhatsZap Flow — ${PLANS[subscription.plan_id]?.name || subscription.plan_id}`,
    });

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        organization_id: req.organizationId,
        subscription_id: subscription.id,
        provider: provider.name,
        provider_ref: charge.providerRef,
        method: 'pix',
        amount_cents: amountCents,
        status: 'pending',
        pix_payload: charge.pixPayload,
        pix_qr_code: charge.pixQrCode,
        description: charge.description,
        expires_at: charge.expiresAt,
      })
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json({ payment, manual: isManualProvider() });
  } catch (err) {
    next(err);
  }
});

subscriptionRouter.get('/payments', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('organization_id', req.organizationId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Confirmação manual do PIX (enquanto não há provedor plugado).
// Quando entrar Mercado Pago/Asaas, isso vira um webhook e esta rota some.
subscriptionRouter.post('/payments/:id/confirm', requireRole('owner'), async (req, res, next) => {
  try {
    if (!isManualProvider()) {
      return res.status(400).json({
        error: 'Com provedor automático, a confirmação vem pelo webhook.',
        code: 'AUTOMATIC_PROVIDER',
      });
    }

    const { data: payment, error: payError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId)
      .single();
    if (payError) throw payError;

    if (payment.status === 'paid') {
      return res.json({ payment, alreadyPaid: true });
    }

    const paidAt = new Date();
    const periodEnd = new Date(paidAt);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data: updated, error: updateError } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: paidAt.toISOString() })
      .eq('id', payment.id)
      .select('*')
      .single();
    if (updateError) throw updateError;

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_end: periodEnd.toISOString(),
        updated_at: paidAt.toISOString(),
      })
      .eq('organization_id', req.organizationId)
      .select('*')
      .single();
    if (subError) throw subError;

    res.json({ payment: updated, subscription });
  } catch (err) {
    next(err);
  }
});
