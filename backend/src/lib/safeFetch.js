import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Proteção contra SSRF no bloco HTTP dos fluxos.
 *
 * O cliente escreve a URL que quiser no editor. Sem filtro, ele poderia
 * apontar para dentro da nossa própria infraestrutura:
 *   - http://169.254.169.254/  → metadados da nuvem (credenciais da máquina)
 *   - http://localhost:3333/   → a própria API, ignorando autenticação
 *   - http://10.x / 192.168.x  → serviços na rede privada
 *
 * Resolvemos o DNS antes e recusamos qualquer IP que não seja público. Isso
 * também barra o truque de um domínio público apontar para 127.0.0.1.
 */

const BLOCKED_PORTS = new Set([22, 25, 445, 3306, 5432, 6379, 11211, 27017]);

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / metadados
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast e reservados
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.replace('::ffff:', ''));
  return false;
}

export function isPrivateAddress(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // não é IP válido: recusa
}

export class BlockedUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('URL inválida');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BlockedUrlError(`Protocolo não permitido: ${url.protocol}`);
  }

  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (BLOCKED_PORTS.has(port)) {
    throw new BlockedUrlError(`Porta não permitida: ${port}`);
  }

  // Se o host já é um IP, verifica direto; senão resolve o DNS.
  let addresses;
  if (net.isIP(url.hostname)) {
    addresses = [url.hostname];
  } else {
    try {
      addresses = (await dns.lookup(url.hostname, { all: true })).map((a) => a.address);
    } catch {
      throw new BlockedUrlError(`Não foi possível resolver o endereço ${url.hostname}`);
    }
  }

  if (!addresses.length) throw new BlockedUrlError('Host não resolvido');

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new BlockedUrlError(
        `O endereço ${url.hostname} aponta para a rede interna (${address}) e foi bloqueado.`,
      );
    }
  }

  return url;
}
