import { config } from '../config.js';

/**
 * Integração com a Google Places API (Text Search + Place Details).
 *
 * Importante: não existe uma API pública que "leia" um ICP em texto livre e
 * devolva empresas que batem com critérios como faturamento ou porte — isso
 * não é algo que o Google Meu Negócio expõe. O que dá pra fazer de verdade,
 * e que é o que essa integração faz, é buscar estabelecimentos cadastrados
 * no Google (Google Meu Negócio / Google Maps) por categoria + região,
 * exatamente como uma busca no Google Maps — ex: "clínicas odontológicas em
 * Pinheiros, São Paulo". Por isso a tela de Prospecção pede um termo de
 * busca objetivo (categoria + local), além da descrição do ICP (que fica
 * salva como contexto/anotação da campanha de prospecção).
 */

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export function isConfigured() {
  return Boolean(config.googlePlacesApiKey);
}

export async function searchPlaces(query, { maxResults = 20 } = {}) {
  if (!isConfigured()) {
    throw new Error('GOOGLE_PLACES_API_KEY não configurada no backend (.env)');
  }

  const url = new URL(TEXT_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set('key', config.googlePlacesApiKey);

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places retornou erro: ${data.status} — ${data.error_message || ''}`);
  }

  const results = (data.results || []).slice(0, maxResults);

  // A Text Search não retorna telefone/site — precisa de uma chamada de
  // Place Details por resultado. É aqui que a maior parte do custo da busca
  // acontece, por isso o limite de resultados é configurável.
  const detailed = await Promise.all(results.map((r) => getPlaceDetails(r.place_id, r)));
  return detailed.filter(Boolean);
}

async function getPlaceDetails(placeId, fallback) {
  try {
    const url = new URL(DETAILS_URL);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set(
      'fields',
      'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status'
    );
    url.searchParams.set('key', config.googlePlacesApiKey);

    const res = await fetch(url);
    const data = await res.json();
    const details = data.result || {};

    return {
      googlePlaceId: placeId,
      name: details.name || fallback.name,
      phone: normalizePhone(details.international_phone_number || details.formatted_phone_number),
      formattedAddress: details.formatted_address || fallback.formatted_address,
      website: details.website || null,
      rating: details.rating ?? fallback.rating ?? null,
      userRatingsTotal: details.user_ratings_total ?? fallback.user_ratings_total ?? null,
      businessStatus: details.business_status || fallback.business_status || null,
    };
  } catch {
    // Se o Details falhar para um resultado específico, ainda devolve o
    // básico da Text Search em vez de derrubar a busca inteira.
    return {
      googlePlaceId: placeId,
      name: fallback.name,
      phone: null,
      formattedAddress: fallback.formatted_address,
      website: null,
      rating: fallback.rating ?? null,
      userRatingsTotal: fallback.user_ratings_total ?? null,
      businessStatus: fallback.business_status || null,
    };
  }
}

/** Normaliza telefone para dígitos apenas (formato aceito pelo WhatsApp/JID) */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}
