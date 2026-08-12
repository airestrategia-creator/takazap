# Backend na Oracle Cloud (Always Free)

Objetivo: rodar o backend do TakaZap numa VM grátis da Oracle, sempre ligada,
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
- `VITE_API_URL` já aponta para `https://api.takazap.com.br`.
- Ajusto `FRONTEND_ORIGIN` no backend para `https://www.takazap.com.br` (CORS).
- Redeploy do painel pelo GitHub Actions.
- Removo o app do Fly pra não confundir.

## Domínio (takazap.com.br, registrado no Registro.br)

Divisão dos endereços:

| Endereço | Aponta para | Serve |
|---|---|---|
| `www.takazap.com.br` | Cloudflare Pages | painel (site estático) |
| `takazap.com.br` | redireciona para o `www` | — |
| `api.takazap.com.br` | IP público da VM Oracle | backend (Node + Baileys) |

O caminho recomendado é mover o DNS para a Cloudflare (plano grátis):
no Registro.br, em **DNS → Alterar servidores DNS**, trocar os servidores do
Registro.br pelos dois nameservers que a Cloudflare informa ao adicionar o
domínio. Propaga em minutos (pode levar até algumas horas).

Depois, na Cloudflare:
- `api` → registro **A** para o IP da VM, com proxy **desligado** (nuvem cinza).
  Precisa estar cinza: com o proxy ligado, o Caddy não consegue emitir o
  certificado e o WebSocket do painel fica atrás de mais uma camada sem
  necessidade.
- `www` → o próprio Pages cria o CNAME quando o domínio é adicionado em
  **Custom domains** do projeto.

## Observação sobre HTTPS
O painel roda em HTTPS. Por segurança do navegador, o backend também precisa
de HTTPS — não dá pra chamar `http://<ip>` de uma página HTTPS. O Caddy emite
o certificado de `api.takazap.com.br` sozinho, via Let's Encrypt, assim que o
DNS estiver apontando para o IP da VM. Por isso o DNS vem antes do provisionamento.
