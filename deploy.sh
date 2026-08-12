#!/usr/bin/env bash
# Sobe o TakaZap inteiro: backend no Fly.io + painel no Cloudflare Pages.
#
# Pré-requisitos (uma vez só):
#   - .deploy.env preenchido com FLY_API_TOKEN e CLOUDFLARE_API_TOKEN
#     (criados no site de cada serviço — as instruções estão no arquivo)
#   - backend/.env com SUPABASE_SERVICE_ROLE_KEY preenchida
#
# Depois disso: bash deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLY="$HOME/.fly/bin/flyctl"
APP="takazap-backend"
PAGES_PROJECT="takazap"
REGION="gru"
SUPABASE_URL="https://gqtjcjdirarbnegqdutt.supabase.co"

say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- checagens

[ -f "$ROOT/.deploy.env" ] || die "Falta o .deploy.env com os tokens do Fly.io e do Cloudflare."
set -a
# shellcheck disable=SC1090
. "$ROOT/.deploy.env"
set +a

[ -n "${FLY_API_TOKEN:-}" ] || die "FLY_API_TOKEN vazio em .deploy.env — crie em https://fly.io/dashboard/personal/tokens"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "CLOUDFLARE_API_TOKEN vazio em .deploy.env — crie em https://dash.cloudflare.com/profile/api-tokens"

[ -f "$ROOT/backend/.env" ] || die "backend/.env não existe."

# shellcheck disable=SC1091
SERVICE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ROOT/backend/.env" | cut -d= -f2-)"
JWT_SECRET="$(grep -E '^JWT_SECRET=' "$ROOT/backend/.env" | cut -d= -f2-)"
PIX_KEY="$(grep -E '^PIX_KEY=' "$ROOT/backend/.env" | cut -d= -f2- || true)"

[ -n "$SERVICE_KEY" ] || die "SUPABASE_SERVICE_ROLE_KEY vazia em backend/.env.
  Pegue em https://supabase.com/dashboard/project/gqtjcjdirarbnegqdutt/settings/api-keys"
[ -n "$JWT_SECRET" ] || die "JWT_SECRET vazio em backend/.env."

[ -x "$FLY" ] || die "flyctl não encontrado em $FLY"
"$FLY" auth whoami >/dev/null 2>&1 || die "O FLY_API_TOKEN foi recusado. Gere outro em https://fly.io/dashboard/personal/tokens"
npx --yes wrangler whoami >/dev/null 2>&1 || die "O CLOUDFLARE_API_TOKEN foi recusado. Confira o escopo (precisa de Workers/Pages)."

say "Autenticado em Fly.io e Cloudflare. Começando."

# ---------------------------------------------------------------- backend

cd "$ROOT/backend"

if ! "$FLY" status --app "$APP" >/dev/null 2>&1; then
  say "Criando o app $APP no Fly.io"
  "$FLY" launch --no-deploy --copy-config --name "$APP" --region "$REGION" --yes
else
  say "App $APP já existe, seguindo"
fi

# O volume guarda a credencial da sessão do WhatsApp. Sem ele, todo deploy
# faria você ler o QR code de novo.
if ! "$FLY" volumes list --app "$APP" 2>/dev/null | grep -q whatsapp_storage; then
  say "Criando o volume de sessão do WhatsApp"
  "$FLY" volumes create whatsapp_storage --size 1 --region "$REGION" --app "$APP" --yes
fi

say "Gravando os segredos"
"$FLY" secrets set --app "$APP" --stage \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  JWT_SECRET="$JWT_SECRET" \
  PAYMENT_PROVIDER=manual \
  PIX_KEY="$PIX_KEY" \
  FRONTEND_ORIGIN="https://$PAGES_PROJECT.pages.dev"

say "Publicando o backend (o Fly compila remoto, pode levar alguns minutos)"
"$FLY" deploy --remote-only --app "$APP"

API_URL="https://$("$FLY" status --app "$APP" --json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).Hostname')"
say "Backend no ar: $API_URL"

curl -fsS "$API_URL/health" >/dev/null && echo "  health check ok" || die "O backend subiu mas /health não respondeu."

# ---------------------------------------------------------------- frontend

cd "$ROOT/frontend"

say "Apontando o painel para $API_URL"
node -e '
  const fs = require("fs");
  const url = process.argv[1];
  const file = ".env";
  let env = fs.readFileSync(file, "utf8");
  env = env.replace(/^VITE_API_URL=.*$/m, "VITE_API_URL=" + url);
  fs.writeFileSync(file, env);
' "$API_URL"

say "Compilando o painel"
npm run build

# O wrangler não cria o projeto sozinho no deploy — se não existir, ele falha.
if ! npx --yes wrangler pages project list 2>/dev/null | grep -q "\b$PAGES_PROJECT\b"; then
  say "Criando o projeto $PAGES_PROJECT no Cloudflare Pages"
  npx --yes wrangler pages project create "$PAGES_PROJECT" --production-branch=main
fi

# --branch=main força PRODUÇÃO. Sem isso o wrangler usa o nome do branch git
# (master), que cai em "Preview" e não atualiza takazap.pages.dev.
say "Publicando no Cloudflare Pages (produção)"
npx --yes wrangler pages deploy dist --project-name="$PAGES_PROJECT" --branch=main --commit-dirty=true

PANEL_URL="https://$PAGES_PROJECT.pages.dev"

# ---------------------------------------------------------------- CORS

say "Liberando o CORS do backend para $PANEL_URL"
"$FLY" secrets set --app "$APP" FRONTEND_ORIGIN="$PANEL_URL"

printf '\n\033[1;32m✓ No ar\033[0m\n'
printf '  Painel:  %s\n' "$PANEL_URL"
printf '  API:     %s\n\n' "$API_URL"
printf 'Entre com airestrategia@gmail.com e conecte o número em Dispositivos.\n\n'
