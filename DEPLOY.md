# Subir o TakaZap

Estado em 10/08/2026:

- ✅ **Banco pronto.** As migrações 001–005 já estão aplicadas no Supabase
  `gqtjcjdirarbnegqdutt` (projeto "Air Estratégia"). A organização
  "Air Estratégia" já tem assinatura em trial e você está como `owner`.
- ✅ **`frontend/.env` pronto**, com URL e anon key reais.
- ⚠️ **`backend/.env` falta uma linha:** `SUPABASE_SERVICE_ROLE_KEY`.
- ⚠️ **Deploy precisa do seu login** no Fly.io e no Cloudflare — são fluxos que
  abrem o navegador e pedem sua senha, então só você pode fazer.

---

## Passo 1 — a chave que falta (1 minuto)

1. Abra <https://supabase.com/dashboard/project/gqtjcjdirarbnegqdutt/settings/api-keys>
2. Em **service_role**, clique em *Reveal* e copie.
3. Cole em `backend/.env`, na linha `SUPABASE_SERVICE_ROLE_KEY=`.

Essa chave ignora RLS e dá acesso total ao banco. Ela fica só no backend,
nunca no frontend, e o `.env` já está no `.gitignore`.

## Passo 2 — rodar local (para acessar agora)

Dois terminais:

```bash
cd takazap/backend && npm run dev
```

```bash
cd takazap/frontend && npm run dev
```

Abra <http://localhost:5173> e entre com `airestrategia@gmail.com`.
Depois vá em **Dispositivos → Adicionar dispositivo** e leia o QR code.

## Passo 3 — publicar o backend (Fly.io)

O backend precisa de um processo sempre ligado, porque segura a conexão do
WhatsApp aberta. Não funciona em serverless.

```bash
"$HOME/.fly/bin/flyctl" auth login
```

Depois:

```bash
cd takazap/backend && "$HOME/.fly/bin/flyctl" launch --no-deploy --copy-config --name takazap-backend --region gru
```

```bash
cd takazap/backend && "$HOME/.fly/bin/flyctl" volumes create whatsapp_storage --size 1 --region gru
```

Os segredos (troque `<SERVICE_ROLE_KEY>` pela chave do passo 1):

```bash
cd takazap/backend && "$HOME/.fly/bin/flyctl" secrets set SUPABASE_URL=https://gqtjcjdirarbnegqdutt.supabase.co SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> JWT_SECRET=<VALOR_DO_backend/.env> FRONTEND_ORIGIN=https://takazap.pages.dev PAYMENT_PROVIDER=manual
```

```bash
cd takazap/backend && "$HOME/.fly/bin/flyctl" deploy
```

Anote a URL que ele devolver (algo como `https://takazap-backend.fly.dev`).

> O `fly.toml` já vem com `auto_stop_machines = false`. Não mude: se a máquina
> dormir, a conexão do WhatsApp cai e você precisa ler o QR code de novo.

## Passo 4 — publicar o painel (Cloudflare Pages)

Troque `VITE_API_URL` em `frontend/.env` pela URL do Fly.io, e então:

```bash
cd takazap/frontend && npm run build
```

```bash
npx wrangler login
```

```bash
cd takazap/frontend && npx wrangler pages deploy dist --project-name=takazap
```

## Passo 5 — fechar o CORS

Ajuste `FRONTEND_ORIGIN` no Fly.io para a URL real que o Cloudflare devolveu:

```bash
cd takazap/backend && "$HOME/.fly/bin/flyctl" secrets set FRONTEND_ORIGIN=https://<sua-url>.pages.dev
```

---

## Antes de vender para terceiros

- **Os dois add-ons cobram sem entregar.** "Proxy anti-queda" e "Privacidade do
  número" são só botões que mudam o preço; não há nada implementado atrás
  deles. Ou implemente, ou tire da tela de Assinatura.
- **O PIX é confirmado à mão.** `PAYMENT_PROVIDER=manual`: o cliente paga e
  alguém com papel de `owner` precisa clicar em "Já paguei — confirmar" no
  painel. Para liberar na hora, plugue um provedor em
  `backend/src/services/payments.js` e preencha `PIX_KEY`.
- **Risco de bloqueio do número.** A conexão é WhatsApp Web não-oficial. Use
  número dedicado, respeite os intervalos e não dispare para lista fria.
