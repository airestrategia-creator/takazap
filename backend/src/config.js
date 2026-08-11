import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3333),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  // Legado da época em que havia uma organização só. Hoje a org vem do
  // vínculo do usuário (header x-organization-id), então é opcional.
  defaultOrgId: process.env.DEFAULT_ORGANIZATION_ID || null,
  jwtSecret: required('JWT_SECRET'),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  whatsappAuthDir: process.env.WHATSAPP_AUTH_DIR || './storage/whatsapp-auth',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || null,

  // Pagamento: 'manual' registra a cobrança e espera confirmação no painel.
  // Ao plugar um provedor de verdade, implemente-o em services/payments.js.
  paymentProvider: process.env.PAYMENT_PROVIDER || 'manual',
  pixKey: process.env.PIX_KEY || null,
};
