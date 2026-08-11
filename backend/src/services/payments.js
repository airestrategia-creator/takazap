// Adaptador de pagamento PIX.
//
// Hoje só existe o provider `manual`: a cobrança é registrada no banco e a
// confirmação é feita por um owner no painel (ou por script). Quando plugar um
// provedor de verdade (Mercado Pago, Asaas, Efí), implemente a mesma interface
// e registre no mapa PROVIDERS — nada fora deste arquivo precisa mudar.
//
// Interface esperada:
//   createPixCharge({ organizationId, amountCents, description }) ->
//     { providerRef, pixPayload, pixQrCode, expiresAt }
//   parseWebhook(req) -> { providerRef, status } | null

import { config } from '../config.js';

const manualProvider = {
  name: 'manual',

  async createPixCharge({ amountCents, description }) {
    // Sem provedor plugado, devolvemos a chave PIX estática configurada no
    // .env. O owner confere o comprovante e confirma no painel.
    if (!config.pixKey) {
      throw new Error(
        'PIX_KEY não configurada no .env — defina a chave PIX que vai receber os pagamentos.',
      );
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      providerRef: null,
      pixPayload: config.pixKey,
      pixQrCode: null,
      expiresAt,
      manual: true,
      description,
      amountCents,
    };
  },

  parseWebhook() {
    return null; // provider manual não recebe webhook
  },
};

const PROVIDERS = {
  manual: manualProvider,
};

export function getPaymentProvider() {
  const name = config.paymentProvider || 'manual';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Provedor de pagamento "${name}" não implementado. Providers disponíveis: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }
  return provider;
}

export const isManualProvider = () => (config.paymentProvider || 'manual') === 'manual';
