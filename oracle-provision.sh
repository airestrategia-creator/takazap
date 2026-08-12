#!/usr/bin/env bash
# Provisiona o backend do TakaZap numa VM Ubuntu da Oracle Cloud.
# Roda DENTRO da VM (via SSH). Deixa o backend no ar como serviço, com HTTPS.
#
# Uso (eu executo por SSH, passando as variáveis):
#   SUPABASE_SERVICE_ROLE_KEY=... JWT_SECRET=... PIX_KEY=... FRONT=... bash oracle-provision.sh
#
# Variáveis esperadas no ambiente:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, FRONTEND_ORIGIN
#   PAYMENT_PROVIDER (opcional, default manual), PIX_KEY (opcional)
#   PUBLIC_HOST  -> domínio/host para o HTTPS (ex: 1-2-3-4.sslip.io ou api.dominio.com)

set -euo pipefail

APP_DIR=/opt/takazap
REPO=https://github.com/airestrategia-creator/takazap.git

echo "▸ Atualizando o sistema"
sudo apt-get update -qq && sudo apt-get upgrade -y -qq

echo "▸ Instalando Node 22, git e Caddy"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
sudo apt-get install -y -qq nodejs git debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -qq && sudo apt-get install -y -qq caddy

echo "▸ Abrindo portas no firewall da VM (Ubuntu iptables)"
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || sudo bash -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true

echo "▸ Baixando o backend"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

echo "▸ Instalando dependências do backend"
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "▸ Escrevendo o backend/.env"
cat > "$APP_DIR/backend/.env" <<ENV
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
JWT_SECRET=${JWT_SECRET}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
PORT=3333
WHATSAPP_AUTH_DIR=${APP_DIR}/storage/whatsapp-auth
PAYMENT_PROVIDER=${PAYMENT_PROVIDER:-manual}
PIX_KEY=${PIX_KEY:-}
ENV
mkdir -p "$APP_DIR/storage/whatsapp-auth"

echo "▸ Criando o serviço systemd (liga no boot, reinicia se cair)"
sudo tee /etc/systemd/system/takazap.service >/dev/null <<UNIT
[Unit]
Description=TakaZap backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable takazap
sudo systemctl restart takazap

echo "▸ Configurando o Caddy (HTTPS automático) em ${PUBLIC_HOST}"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
${PUBLIC_HOST} {
    reverse_proxy localhost:3333
}
CADDY
sudo systemctl restart caddy

echo "▸ Aguardando o backend subir"
sleep 5
curl -fsS http://localhost:3333/health && echo " <- backend local OK" || echo " !! backend não respondeu local"

echo "✓ Pronto. Backend em https://${PUBLIC_HOST}"
