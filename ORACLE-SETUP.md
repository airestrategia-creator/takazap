# Backend na Oracle Cloud (Always Free)

Objetivo: rodar o backend do WhatsZap numa VM grátis da Oracle, sempre ligada,
substituindo o Fly.io. Você faz a parte do site da Oracle; eu instalo e
configuro o servidor.

---

## PARTE 1 — Criar a conta e a VM (você faz, eu te guio na tela)

### 1.1 Criar a conta Oracle Cloud
- <https://www.oracle.com/br/cloud/free/>
- Precisa de cartão (só validação — recursos Always Free não cobram).
- Escolha uma **região** perto (ex: `Brazil East (São Paulo)` — sa-saopaulo-1).
  Se der "out of capacity" na criação da VM, tente outra região no cadastro.

### 1.2 Criar a instância (a VM)
No painel: **Menu → Compute → Instances → Create instance**.
- **Image**: Canonical **Ubuntu 22.04**
- **Shape**: clique em "Change shape" → **Ampere (ARM)** → `VM.Standard.A1.Flex`
  → 1 OCPU e 6 GB de RAM (tudo dentro do Always Free). Se ARM der "out of
  capacity", use `VM.Standard.E2.1.Micro` (AMD, também Always Free).
- **SSH keys**: escolha **"Generate a key pair for me"** e **baixe a chave
  privada** (arquivo `.key`). Guarde — é como eu vou entrar no servidor.
- **Create**. Anote o **Public IP** que aparecer.

### 1.3 Liberar a porta do backend (Ingress)
A VM vem com firewall fechado. Abra a porta:
- Na instância → **Virtual Cloud Network** → **Security Lists** → **Default
  Security List** → **Add Ingress Rules**:
  - Source: `0.0.0.0/0`
  - IP Protocol: TCP
  - Destination Port: `443` (e `80`)
- Salvar.

### 1.4 Me entregar o acesso
Cole num arquivo `.oracle.txt` na pasta do projeto (eu leio e apago):
```
IP=<o Public IP da VM>
```
E me diga onde salvou o arquivo `.key` que você baixou. Com isso eu entro por
SSH e configuro tudo.

---

## PARTE 2 — Instalar o backend (eu faço)

Assim que eu tiver o IP e a chave, rodo o `oracle-provision.sh`, que:
1. Instala Node 22, git e o Caddy (HTTPS automático).
2. Baixa o backend do GitHub.
3. Recria o `backend/.env` com as chaves (Supabase etc.).
4. Sobe o backend como serviço `systemd` (liga sozinho no boot, reinicia se cair).
5. Configura o Caddy pra dar HTTPS no IP/domínio.

## PARTE 3 — Apontar o painel para o novo backend (eu faço)
- Troco `VITE_API_URL` para o endereço da Oracle.
- Ajusto `FRONTEND_ORIGIN` no backend (CORS).
- Redeploy do painel pelo GitHub Actions.
- Removo o app do Fly pra não confundir.

## Observação sobre HTTPS
O painel roda em HTTPS (Cloudflare). Por segurança do navegador, o backend
também precisa de HTTPS. Sem um domínio, dá pra usar um subdomínio grátis
(ex: sslip.io/nip.io apontando pro IP) que o Caddy consegue certificar — eu
resolvo isso na Parte 2. Se você tiver um domínio (ex: api.suaempresa.com.br),
melhor ainda: é só apontar pro IP.
