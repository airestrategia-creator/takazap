# Mapeamento do painel Botzap (referência funcional)

Levantado em 10/08/2026 acessando o painel logado da org "ITA Frotas".
Serve como especificação do que o WhatsZap Flow precisa cobrir. **Só a
estrutura funcional foi copiada** — o visual do Botzap é dark/verde; o nosso é
roxo/branco.

## Navegação (sidebar)

`Visão geral` · `Fluxos` · `Dispositivos` · `Inbox` · `Kanban` · `PlusTV` ·
`Assinatura`, mais um seletor de organização no rodapé (`ORG ITA Frotas`) e
`Sair`. Sidebar é colapsável.

Rotas no padrão `/org/:orgId/<secao>` — ou seja, multi-tenant com a org na URL.

## Visão geral

- Saudação "Bem-vindo de volta, {nome}" + resumo ("N contatos na base · N
  mensagens nos últimos 7 dias").
- Ações no topo: **Criar fluxo**, **Configurações**.
- Cards de métrica: Mensagens (hoje, contagem UTC), Fluxos ativos, Tempo médio
  de resposta (marcado "Em breve"), Dispositivos.
- Tabela **Fluxos recentes**: nome, última edição, status, ação de editar.
- Card **Status WhatsApp** com badge CONECTADO, nome do dispositivo, estado
  ("Working — Conectado") e botões Configurar / Inbox.
- Card de tutorial em vídeo.

## Fluxos

- Cabeçalho com **Tutorial**, **Importar JSON**, **Novo fluxo**.
- Métricas: Mensagens (7 dias), Fluxos ativos (`n/total`), Total de automações.
- Busca + seleção múltipla com **Exportar JSON** e **Excluir** em lote.
- Tabela: checkbox, nome + subtítulo, última edição ("Há 2 h"), status, editar.

## Editor de fluxo

- Topo: **Voltar**, campo de nome, checkbox **Ativo**, botão **Salvar**.
- Bloco **Dispositivos desta automação**: "Todos os dispositivos da
  organização" ou "Somente dispositivos selecionados" — o escopo vale tanto
  para mensagens recebidas quanto para webhook de automação.
- Paleta **Blocos básicos**: `Condição`, `Ação · tag`, `Mensagem`,
  `HTTP (API JSON)`, `Espera`, `Aguardar resposta`, e um atalho
  **Inserir exemplo completo**.
- Canvas com grid pontilhado e nós conectáveis. Nó **Início / Gatilhos** com o
  gatilho ("Mensagem recebida") e contadores de execução por nó
  (`1 ok · 0 alerta · 0 erro`).
- Convenção de portas: saída **verde** do Início para o primeiro bloco; na
  Condição, **azul = sim** e **vermelho = não**.
- Painel **Propriedades** à direita, que edita o bloco selecionado no canvas.

## Dispositivos

- Texto: várias instâncias por organização; estatísticas somam a org (UTC).
- Botão **+ Adicionar dispositivo**.
- Card por dispositivo: avatar/letra, nome (`default`), badge Conectado,
  **Excluir dispositivo**, número do WhatsApp, e estatísticas de mensagens
  (hoje / últimos 7 dias / últimos 30 dias / total).

## Kanban

- Seletor de **Dispositivo** no topo (`default (ready)`) — o Kanban é por
  dispositivo, via query param `?deviceId=`.
- Busca de contatos, ordenação (**Última mensagem (recentes)**) e **Filtros**.
- Colunas com contador: `Sem coluna`, `Novo`, `Em atendimento`, ... com scroll
  horizontal.
- Card do contato: avatar, nome, telefone, badge de não lidas, botão que abre a
  conversa naquele dispositivo, tags e data da última mensagem. Arrastável
  entre colunas para mudar o estágio.

## Assinatura

- Cards de status: **Período de testes** (WhatsApp liberado), datas (início do
  trial e "Pago até"), **Dispositivos** `1/1`, **Disparos no teste** `0/50`.
- **Pagamento via PIX** — "PIX confirmado libera acesso na hora". Acima de 10
  dispositivos, falar com o suporte.
- Aviso contextual de upgrade: detecta uso de recurso fora do plano
  ("Você usou o Inbox no trial. No plano Inicial o atendimento pelo Inbox some
  do menu") com CTA direto para o plano que resolve.
- Configuração da assinatura: stepper **+N dispositivos extras** (R$ 9,90 cada,
  1 incluso) e toggles de add-on a R$ 9,90/mês cada:
  - Transcrição no inbox (até 300 min/mês)
  - Proxy anti-queda (proxy dedicado)
  - Privacidade profissional (rejeitar ligações, vistos, presença)
- Resumo **Extras selecionados** com o total mensal recalculado ao vivo.

## Planos

| Plano | Preço | Inclui |
|---|---|---|
| Inicial | R$ 29,90/mês | fluxos ilimitados, automações, disparos, 1 dispositivo |
| Completo | R$ 44,90/mês | + Inbox e Kanban |
| Completo + Equipe | R$ 59,90/mês | + até 5 membros, papéis e permissões |

Trial de 3 dias com 1 WhatsApp e teto de 50 disparos.

## O que NÃO vamos copiar

**Áudio e mídia ficam fora do produto, por decisão da Isabela (10/08/2026).**
Isso derruba, em relação ao Botzap:

- o add-on de **transcrição no inbox** (R$ 9,90/mês) — só existia por causa de áudio;
- **mídia no inbox** (imagem, áudio, documento);
- **mídia em campanha**.

Na prática o WhatsZap é uma ferramenta de texto: mensagem recebida que não é
texto é ignorada de propósito em `backend/src/services/whatsapp.js`. Se algum
dia isso mudar, é uma decisão de produto — não trate como pendência técnica.

## Decisões que isso força no nosso projeto

1. **Multi-tenant com org na URL** (`/org/:orgId/...`) e seletor de org.
2. **Pagamento por PIX**, não cartão — precisa de provedor PIX com webhook de
   confirmação para liberar acesso na hora.
3. **Gating por plano**: Inbox e Kanban somem do menu no plano Inicial; contador
   de disparos no trial; limite de dispositivos.
4. **Add-ons como toggles** que alteram o valor mensal, não planos separados.
5. **Estatísticas por dispositivo** além das da organização.
6. **Import/export de fluxo em JSON** — bom para suporte e para duplicar fluxo
   entre orgs.
7. **Contadores de execução por nó** no canvas (ok/alerta/erro) — exige
   telemetria por nó no motor de fluxo.
