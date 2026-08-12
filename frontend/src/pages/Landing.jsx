import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Workflow, MessagesSquare, KanbanSquare, Send, Smartphone,
  ShieldCheck, Users, QrCode, TrendingUp, Check, ChevronDown, ArrowRight, Zap,
} from 'lucide-react';
import { PLANS, ADDONS, formatBRL } from '../lib/plans.js';

const FEATURES = [
  {
    icon: Workflow,
    title: 'Fluxos visuais',
    text: 'Arraste nós de mensagem, condição, espera e requisição HTTP num editor visual. O fluxo responde, qualifica e encaminha sozinho — com gatilho por palavra-chave ou primeira mensagem.',
  },
  {
    icon: MessagesSquare,
    title: 'Inbox completo',
    text: 'Todas as conversas dos seus números num só lugar, com histórico preservado e busca por contato.',
  },
  {
    icon: KanbanSquare,
    title: 'Kanban de vendas',
    text: 'Arraste conversas pelas etapas do funil e não perca lead no meio do caminho.',
  },
  {
    icon: Send,
    title: 'Disparos em massa',
    text: 'Campanhas segmentadas por tag ou etapa do funil, com variáveis e cadência controlada.',
  },
  {
    icon: Smartphone,
    title: 'Multi-dispositivos',
    text: 'Conecte vários números de WhatsApp na mesma organização, cada um com seus próprios fluxos.',
  },
  {
    icon: Users,
    title: 'Equipe',
    text: 'Convide atendentes com papéis e permissões, transfira conversas e acompanhe quem está online.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacidade do número',
    badge: 'ADD-ON',
    text: 'Rejeite ligações automaticamente, controle confirmação de leitura e presença — por organização ou por número.',
  },
];

const STEPS = [
  {
    icon: QrCode,
    title: 'Conecte seu número',
    text: 'Escaneie o QR code com o WhatsApp do seu negócio. Leva dois minutos e não instala nada.',
  },
  {
    icon: Workflow,
    title: 'Monte o fluxo',
    text: 'Arraste os nós no editor: boas-vindas, perguntas de qualificação, condições e fechamento.',
  },
  {
    icon: TrendingUp,
    title: 'Atenda no automático',
    text: 'O fluxo responde na hora, a qualquer hora. Você acompanha tudo pelo inbox e pelo Kanban.',
  },
];

const FAQ = [
  {
    q: 'Como funciona o teste grátis?',
    a: 'Você cria a conta e ganha 3 dias com a plataforma inteira liberada, sem cartão de crédito. Ao final, escolhe um plano na tela de Assinatura para continuar.',
  },
  {
    q: 'Preciso deixar o celular ligado ou instalar algo?',
    a: 'Não. A conexão fica no servidor. Depois de escanear o QR code uma vez, o número continua respondendo mesmo com o celular desligado.',
  },
  {
    q: 'Posso usar mais de um número de WhatsApp?',
    a: 'Sim. Cada plano já vem com um dispositivo incluso e você adiciona números extras como add-on, todos na mesma organização.',
  },
  {
    q: 'Meu número pode ser bloqueado?',
    a: 'A conexão usa o WhatsApp Web, que é como a maioria das ferramentas do mercado funciona — mas não é oficial da Meta. Use um número dedicado, respeite os intervalos entre mensagens e só dispare para quem deu opt-in. Listas frias são o principal gatilho de bloqueio.',
  },
  {
    q: 'Posso trocar de plano depois?',
    a: 'Pode, a qualquer momento, pela tela de Assinatura. O upgrade vale na hora e o downgrade entra no próximo ciclo.',
  },
  {
    q: 'Como funciona o cancelamento?',
    a: 'Não tem fidelidade. Você cancela pelo painel e continua com acesso até o fim do ciclo já pago.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-brand-200">
        W
      </div>
      <span className="font-semibold tracking-tight">TakaZap</span>
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    ['#recursos', 'Recursos'],
    ['#como-funciona', 'Como funciona'],
    ['#planos', 'Planos'],
    ['#faq', 'Dúvidas'],
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-100">
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm text-slate-600">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-brand-700 transition-colors">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/entrar"
            className="hidden sm:inline-flex px-3.5 py-2 rounded-lg text-sm text-slate-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            Entrar
          </Link>
          <Link
            to="/criar-conta"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-sm shadow-brand-200"
          >
            Criar conta
            <ArrowRight size={15} />
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden p-2 -mr-2 text-slate-500"
            aria-label="Abrir menu"
            aria-expanded={open}
          >
            <ChevronDown size={18} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-slate-100 px-5 py-3 space-y-1 text-sm">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block py-2 text-slate-600 hover:text-brand-700"
            >
              {label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45rem_28rem_at_15%_-10%,#ede9fe_0%,transparent_65%),radial-gradient(40rem_26rem_at_95%_10%,#f5f3ff_0%,transparent_60%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-14 md:pt-24 md:pb-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium tracking-wide ring-1 ring-brand-100">
            <Zap size={13} />
            FLUXOS + INBOX + KANBAN NUM SÓ PAINEL
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]">
            Seu WhatsApp atendendo sozinho,{' '}
            <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              24 horas por dia
            </span>
            .
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-xl leading-relaxed">
            Monte fluxos visuais que respondem, qualificam e encaminham enquanto você cuida do
            resto. Sem código e sem mensalidade escondida.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/criar-conta"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-lg shadow-brand-200"
            >
              Testar grátis por 3 dias
              <ArrowRight size={17} />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-brand-200 hover:text-brand-700 transition-colors"
            >
              Ver como funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Sem cartão de crédito · conecte seu número em 2 minutos
          </p>
        </div>

        <ChatPreview />
      </div>
    </section>
  );
}

function ChatPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-tr from-brand-100 to-transparent rounded-[2rem] blur-2xl opacity-70" aria-hidden />
      <div className="relative rounded-2xl bg-white ring-1 ring-slate-200 shadow-xl shadow-slate-200/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
            LJ
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 leading-tight">Sua loja no WhatsApp</p>
            <p className="text-xs text-brand-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              fluxo ativo · respondendo sozinho
            </p>
          </div>
        </div>

        <div className="px-4 py-5 space-y-3 bg-slate-50/70">
          <Bubble side="left">Oi! Vi o anúncio de vocês. Quanto custa?</Bubble>
          <Bubble side="right">
            Olá! 👋 Hoje temos condição especial com frete grátis. Me conta: você fala de qual
            cidade?
          </Bubble>
          <Bubble side="left">De Campinas.</Bubble>
          <Bubble side="right">
            Perfeito, atendemos Campinas com entrega em 24h. Quer que eu já reserve?
          </Bubble>
          <p className="pt-1 text-[11px] font-medium tracking-wide text-brand-600 flex items-center gap-1.5">
            <Zap size={12} />
            ENVIADO PELO FLUXO
          </p>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2">
          {[
            [Zap, 'Gatilho: palavra-chave'],
            [MessagesSquare, 'Enviar mensagem'],
            [Workflow, 'Condição'],
          ].map(([Icon, label]) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs ring-1 ring-brand-100"
            >
              <Icon size={12} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, children }) {
  const right = side === 'right';
  return (
    <div className={right ? 'flex justify-end' : 'flex justify-start'}>
      <p
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          right
            ? 'bg-brand-600 text-white rounded-br-md'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 rounded-bl-md'
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function Stats() {
  const items = [
    ['24/7', 'atendimento sem pausa'],
    ['2 min', 'para conectar seu número'],
    ['∞', 'fluxos por organização'],
    ['0', 'linhas de código necessárias'],
  ];
  return (
    <section className="border-y border-slate-100 bg-slate-50/60">
      <div className="mx-auto max-w-6xl px-5 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {items.map(([value, label]) => (
          <div key={label} className="text-center">
            <p className="text-3xl font-bold text-brand-700 tracking-tight">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        title="Tudo o que sua operação de WhatsApp precisa"
        subtitle="Um painel só, do primeiro contato ao fechamento."
      />
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="group relative p-5 rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-brand-200 hover:shadow-lg hover:shadow-brand-100/60 transition-all"
            >
              {f.badge && (
                <span className="absolute top-4 right-4 text-[10px] font-semibold tracking-wider text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded ring-1 ring-brand-100">
                  {f.badge}
                </span>
              )}
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center ring-1 ring-brand-100 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <Icon size={19} strokeWidth={2} />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-slate-50/70 border-y border-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading
          title="Do zero ao primeiro atendimento automático"
          subtitle="Três passos. Nenhuma linha de código."
        />
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="relative p-6 rounded-2xl bg-white ring-1 ring-slate-200">
                <span className="text-[11px] font-semibold tracking-wider text-brand-500">
                  PASSO {i + 1}
                </span>
                <div className="mt-3 w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-sm shadow-brand-200">
                  <Icon size={20} strokeWidth={2} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{s.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="planos" className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        title="Planos que acompanham seu ritmo"
        subtitle="Mensal, sem fidelidade. Comece pelo teste e faça upgrade quando a operação crescer."
      />

      <div className="mt-12 grid md:grid-cols-3 gap-5 items-start">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative p-6 rounded-2xl bg-white transition-shadow ${
              plan.highlight
                ? 'ring-2 ring-brand-500 shadow-xl shadow-brand-100'
                : 'ring-1 ring-slate-200'
            }`}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-6 px-2.5 py-1 rounded-full bg-brand-600 text-white text-[10px] font-semibold tracking-wider">
                MAIS POPULAR
              </span>
            )}
            <p className="text-[11px] font-semibold tracking-wider text-slate-400">MENSAL</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">{plan.name}</h3>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-slate-900">
                {formatBRL(plan.priceCents)}
              </span>
              <span className="text-sm text-slate-400">/mês</span>
            </p>
            <ul className="mt-5 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-slate-600">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={`/criar-conta?plano=${plan.id}`}
              className={`mt-6 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                plan.highlight
                  ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-200'
                  : 'text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50'
              }`}
            >
              {plan.highlight ? 'Começar com este plano' : 'Assinar'}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <p className="text-[11px] font-semibold tracking-wider text-slate-400 text-center">
          EXPANDA QUANDO PRECISAR
        </p>
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ADDONS.map((a) => (
            <div key={a.id} className="p-4 rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-800">
                {a.name}
                <span className="ml-1.5 text-brand-600 font-semibold">
                  +{formatBRL(a.priceCents)}/mês
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{a.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Teste de 3 dias ao criar a conta; a cobrança começa depois que você escolhe o plano em
          Assinatura, dentro do painel.
        </p>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" className="bg-slate-50/70 border-y border-slate-100">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <SectionHeading title="Perguntas frequentes" subtitle="Ficou alguma dúvida? Fale com a gente." />
        <div className="mt-10 space-y-2.5">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                >
                  <span className="text-sm font-medium text-slate-800">{item.q}</span>
                  <ChevronDown
                    size={17}
                    className={`shrink-0 text-brand-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 -mt-1 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-14 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_20rem_at_80%_-20%,rgba(255,255,255,0.22),transparent_60%)]"
        />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Enquanto você lê isso,
            <br />
            um cliente está esperando resposta.
          </h2>
          <p className="mt-4 text-brand-100 max-w-xl mx-auto leading-relaxed">
            Coloque seu primeiro fluxo no ar hoje e deixe o TakaZap responder por você. Teste
            grátis por 3 dias, sem cartão de crédito.
          </p>
          <Link
            to="/criar-conta"
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-brand-700 bg-white hover:bg-brand-50 transition-colors shadow-lg"
          >
            Criar minha conta grátis
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo className="text-slate-700" />
        <p className="text-xs text-slate-400 text-center sm:text-right">
          TakaZap · automação de WhatsApp
          <br className="sm:hidden" />
          <span className="hidden sm:inline"> · </span>
          Não afiliado ao WhatsApp ou à Meta.
        </p>
      </div>
    </footer>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-slate-600 leading-relaxed">{subtitle}</p>}
    </div>
  );
}
