/**
 * Busca de estabelecimentos no OpenStreetMap (Nominatim + Overpass).
 *
 * Por que não raspar o Google: raspar resultado de busca viola os termos de
 * uso, o Google bloqueia IP de datacenter em poucos minutos (CAPTCHA), e
 * exigiria navegador headless — ~400MB de RAM numa máquina que tem 956MB e já
 * roda a conexão do WhatsApp. Seria uma tela que funciona alguns dias e depois
 * quebra em silêncio.
 *
 * O OSM é a alternativa legítima: base aberta, sem chave, sem cadastro. A
 * cobertura é menor que a do Google — comércio pequeno de bairro às vezes não
 * está mapeado, e telefone existe em menos registros. Em compensação não
 * quebra e não expõe o domínio.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

// A política de uso do Nominatim exige identificar a aplicação. Sem isso o
// serviço responde 403.
const UA = 'TakaZap/1.0 (https://takazap.com.br)';

export function isConfigured() {
  return true; // não depende de chave
}

/**
 * Traduz o texto do ICP para categoria + região.
 *
 * A pessoa escreve "clínicas odontológicas em Pinheiros, São Paulo" e o
 * Overpass precisa de duas coisas separadas: o que procurar e onde. Fazemos a
 * quebra pelo " em " / " no " / " na ", que é como se escreve naturalmente.
 */
export function interpretarIcp(texto) {
  const limpo = String(texto || '').trim();
  const separadores = [' em ', ' no ', ' na ', ' nos ', ' nas ', ' de ', ' - '];

  for (const sep of separadores) {
    const i = limpo.toLowerCase().lastIndexOf(sep);
    if (i > 0) {
      return {
        categoria: limpo.slice(0, i).trim(),
        regiao: limpo.slice(i + sep.length).trim(),
      };
    }
  }
  return { categoria: limpo, regiao: '' };
}

// Palavras do dia a dia mapeadas para as etiquetas do OSM. Quem escreve o ICP
// não conhece — nem deveria conhecer — a taxonomia do OpenStreetMap.
const CATEGORIAS = [
  [/(odonto|dentist|dentári)/i, ['amenity=dentist', 'healthcare=dentist']],
  [/(clínica|clinica|médic|medic|consultóri)/i, ['amenity=clinic', 'amenity=doctors', 'healthcare=centre']],
  [/(academia|crossfit|pilates|fitness)/i, ['leisure=fitness_centre', 'leisure=sports_centre']],
  [/(restaurante|pizzaria|lanchonete|hamburgue)/i, ['amenity=restaurant', 'amenity=fast_food']],
  [/(padaria|panific)/i, ['shop=bakery']],
  [/(salão|salao|cabelei|barbear|estétic|estetic|manicure)/i, ['shop=hairdresser', 'shop=beauty', 'shop=massage']],
  [/(pet|veterin)/i, ['shop=pet', 'amenity=veterinary', 'shop=pet_grooming']],
  [/(farmác|farmac|drogaria)/i, ['amenity=pharmacy']],
  [/(mercado|supermerc|hortifrut|mercearia)/i, ['shop=supermarket', 'shop=convenience', 'shop=greengrocer']],
  [/(escola|colégio|colegio|curso|creche)/i, ['amenity=school', 'amenity=kindergarten', 'amenity=college']],
  [/(hotel|pousada|hostel)/i, ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel']],
  [/(oficina|mecânic|mecanic|autopeç|funilar)/i, ['shop=car_repair', 'shop=car_parts']],
  [/(concessionár|concessionar|revenda|loja de carro|seminovo)/i, ['shop=car']],
  [/(advocac|advogad|jurídic|juridic)/i, ['office=lawyer']],
  [/(contabil|contador)/i, ['office=accountant']],
  [/(imobiliár|imobiliar|corretor)/i, ['office=estate_agent']],
  [/(construtor|material de constru)/i, ['shop=doityourself', 'shop=hardware', 'shop=trade']],
  [/(loja|comérci|comerci|varejo)/i, ['shop']],
  [/(bar|pub|boteco|choper)/i, ['amenity=bar', 'amenity=pub']],
  [/(cafeteria|café|cafe)/i, ['amenity=cafe']],
  [/(transport|logístic|logistic|frete|transportador)/i, ['office=logistics', 'industrial=logistics']],
  [/(locadora|aluguel de carro|rent a car)/i, ['amenity=car_rental']],
];

function filtrosPara(categoria) {
  for (const [padrao, tags] of CATEGORIAS) {
    if (padrao.test(categoria)) return tags;
  }
  // Sem correspondência, procura pelo nome do estabelecimento. Cobre marcas e
  // nichos que não têm etiqueta própria no OSM.
  return null;
}

async function buscarRegiao(regiao) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(regiao)}&format=json&limit=1&polygon_geojson=0`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (!resp.ok) throw new Error(`Não consegui localizar "${regiao}" no mapa.`);
  const dados = await resp.json();
  if (!dados.length) throw new Error(`Região "${regiao}" não encontrada. Tente com a cidade e o estado.`);

  const lugar = dados[0];
  const [sul, norte, oeste, leste] = lugar.boundingbox.map(Number);
  return { sul, norte, oeste, leste, nome: lugar.display_name };
}

function montarConsulta({ sul, oeste, norte, leste }, tags, termoLivre) {
  const caixa = `${sul},${oeste},${norte},${leste}`;

  const blocos = tags
    ? tags.flatMap((tag) => {
        const [chave, valor] = tag.split('=');
        const filtro = valor ? `["${chave}"="${valor}"]` : `["${chave}"]`;
        return [`node${filtro}(${caixa});`, `way${filtro}(${caixa});`];
      })
    : [
        `node["name"~"${termoLivre}",i]["shop"](${caixa});`,
        `way["name"~"${termoLivre}",i]["shop"](${caixa});`,
        `node["name"~"${termoLivre}",i]["office"](${caixa});`,
        `node["name"~"${termoLivre}",i]["amenity"](${caixa});`,
      ];

  return `[out:json][timeout:50];(${blocos.join('')});out center tags 200;`;
}

/**
 * Mesma assinatura do provedor do Google, para a rota de prospecção não
 * precisar saber qual está em uso.
 */
export async function searchPlaces(query, { maxResults = 20 } = {}) {
  const { categoria, regiao } = interpretarIcp(query);
  if (!regiao) {
    throw new Error(
      'Diga também a região. Ex: "clínicas odontológicas em Pinheiros, São Paulo".',
    );
  }

  const area = await buscarRegiao(regiao);
  const tags = filtrosPara(categoria);
  const consulta = montarConsulta(area, tags, categoria.replace(/[^\p{L}\s]/gu, '').trim());

  const resp = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
    body: consulta,
  });
  if (!resp.ok) {
    throw new Error('O serviço de mapas está ocupado agora. Tente de novo em um minuto.');
  }

  const { elements = [] } = await resp.json();

  const vistos = new Set();
  const resultados = [];

  for (const el of elements) {
    const t = el.tags || {};
    const nome = t.name;
    if (!nome) continue; // sem nome não serve como lead

    const chave = nome.toLowerCase().trim();
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const telefone = normalizarTelefone(t.phone || t['contact:phone'] || t.mobile || t['contact:mobile']);

    const endereco = [
      t['addr:street'],
      t['addr:housenumber'],
      t['addr:suburb'] || t['addr:neighbourhood'],
      t['addr:city'],
      t['addr:state'],
    ]
      .filter(Boolean)
      .join(', ');

    resultados.push({
      googlePlaceId: `osm:${el.type}/${el.id}`,
      name: nome,
      phone: telefone,
      formattedAddress: endereco || area.nome,
      website: t.website || t['contact:website'] || null,
      rating: null, // o OSM não tem avaliação
      userRatingsTotal: null,
      businessStatus: null,
    });

    if (resultados.length >= maxResults) break;
  }

  // Quem tem telefone vem primeiro: é o único que dá para prospectar por
  // WhatsApp, e é isso que a pessoa vai importar.
  return resultados.sort((a, b) => (b.phone ? 1 : 0) - (a.phone ? 1 : 0));
}

/** Converte o telefone do OSM para o formato que o WhatsApp aceita. */
function normalizarTelefone(bruto) {
  if (!bruto) return null;
  let digitos = String(bruto).split(';')[0].replace(/\D/g, '');
  if (!digitos) return null;

  // Números brasileiros no OSM aparecem como +55 62 9999-9999, mas também como
  // (62) 99999-9999. Sem o 55 na frente o jid do WhatsApp fica inválido.
  if (digitos.length >= 12 && digitos.startsWith('55')) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length < 10) return null;
  return digitos;
}
