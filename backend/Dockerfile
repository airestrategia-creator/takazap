# Node 22+ é obrigatório: o @supabase/realtime-js usa o WebSocket nativo, que
# não existe no Node 20 — no 20 o processo morre no boot.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# Onde as credenciais do WhatsApp (Baileys) e outros dados locais ficam salvos.
# Monte um volume aqui para não perder a sessão a cada deploy.
RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

EXPOSE 3333
CMD ["node", "src/server.js"]
