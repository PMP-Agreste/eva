import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type FirestoreError,
  type Query,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Cache em memória ───────────────────────────────────────────────────────
// Evita re-buscar do Firestore ao navegar entre páginas.
// TTL padrão: 5 minutos. Pode ser ajustado por query.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Invalida manualmente uma entrada (use após salvar/editar um doc) */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/** Invalida todas as entradas que começam com um prefixo */
export function invalidateCachePrefix(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

// ─── TTLs configuráveis ─────────────────────────────────────────────────────
const TTL = {
  assistidas: 5 * 60 * 1000,    // 5 min — muda raramente
  visitas: 3 * 60 * 1000,        // 3 min — muda com frequência operacional
  agendas: 3 * 60 * 1000,        // 3 min
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function readDoc<T>(collectionName: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as object) } as T;
}

/**
 * SUBSTITUÍMOS onSnapshot por getDocs.
 *
 * Motivo: onSnapshot cobra 1 leitura por documento no carregamento inicial
 * E cobra novamente quando qualquer documento muda — com 400 assistidas,
 * isso pode triplicar o consumo diário de leituras sem necessidade.
 *
 * Para um painel de gestão, dados com 5 min de cache são suficientes.
 * O retorno é uma função de "unsub" vazia para manter compatibilidade
 * com o código existente que chama unsub() no cleanup.
 */
export function listenQuery<T>(
  q: Query<DocumentData>,
  mapFn: (id: string, data: DocumentData) => T,
  onData: (items: T[]) => void,
  onError?: (err: FirestoreError) => void,
): Unsubscribe {
  getDocs(q)
    .then((snap) => onData(snap.docs.map((d) => mapFn(d.id, d.data()))))
    .catch((err) => onError?.(err as FirestoreError));

  // Retorna função vazia no lugar do unsubscribe do onSnapshot
  return () => {};
}

// ─── Queries com cache ────────────────────────────────────────────────────────

export const qAssistidas = () =>
  query(collection(db, 'assistidas'), orderBy('nomeCompleto'), limit(2000));

export const qVisitasRecentes = () =>
  query(collection(db, 'visitas'), orderBy('dataHora', 'desc'), limit(200));

export const qAgendaPorChave = (chaveDiaGuarnicao: string) =>
  query(
    collection(db, 'agendas_planejadas'),
    where('chaveDiaGuarnicao', '==', chaveDiaGuarnicao),
    limit(200),
  );

// ─── Fetch com cache (para uso direto no Dashboard e outras páginas) ──────────

/**
 * Busca assistidas ativas com cache de 5 min.
 * ~400 leituras → executado no máx. 12x por hora por usuário = ~4.800 leituras/hora
 * Sem cache: cada navegação ao dashboard custava 400 leituras.
 */
export async function fetchAssistidasAtivasCache(): Promise<any[]> {
  const KEY = 'assistidas:ativas';
  const cached = cacheGet<any[]>(KEY);
  if (cached) return cached;

  const snap = await getDocs(
    query(collection(db, 'assistidas'), where('ativa', '==', true), limit(2000)),
  );
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cacheSet(KEY, data, TTL.assistidas);
  return data;
}

/**
 * Busca visitas desde X ms com cache de 3 min.
 *
 * IMPORTANTE: removemos a query dupla (qNum + qTs em paralelo).
 * A versão anterior fazia 2x getDocs simultâneos para o mesmo dado,
 * dobrando as leituras. Agora tenta só a query de número (seu formato real);
 * se falhar por índice, tenta a de Timestamp como fallback.
 *
 * Reduzimos também a janela de 120 dias para 50 dias:
 * - O alerta "sem visita" usa 45 dias → 50 dias é suficiente com folga.
 */
export async function fetchVisitasSinceCache(sinceMs: number): Promise<any[]> {
  const KEY = `visitas:since:${Math.floor(sinceMs / (60 * 60 * 1000))}`; // chave por hora
  const cached = cacheGet<any[]>(KEY);
  if (cached) return cached;

  const col = collection(db, 'visitas');

  try {
    const snap = await getDocs(
      query(col, where('dataHora', '>=', sinceMs), orderBy('dataHora', 'desc'), limit(9000)),
    );
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cacheSet(KEY, data, TTL.visitas);
    return data;
  } catch {
    // Fallback: alguns docs podem ter dataHora como Timestamp
    const { Timestamp } = await import('firebase/firestore');
    const snap = await getDocs(
      query(
        col,
        where('dataHora', '>=', Timestamp.fromMillis(sinceMs)),
        orderBy('dataHora', 'desc'),
        limit(9000),
      ),
    );
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cacheSet(KEY, data, TTL.visitas);
    return data;
  }
}

/**
 * Busca agendas planejadas por intervalo de datas com cache de 3 min.
 */
export async function fetchAgendasRangeCache(startKey: string, endKey: string): Promise<any[]> {
  const KEY = `agendas:${startKey}:${endKey}`;
  const cached = cacheGet<any[]>(KEY);
  if (cached) return cached;

  const snap = await getDocs(
    query(
      collection(db, 'agendas_planejadas'),
      where('dataDia', '>=', startKey),
      where('dataDia', '<=', endKey),
      orderBy('dataDia', 'asc'),
      limit(8000),
    ),
  );
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cacheSet(KEY, data, TTL.agendas);
  return data;
}
