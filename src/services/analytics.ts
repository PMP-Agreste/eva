import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type FirestoreError,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export type Guarnicao = 'PMP Alfa' | 'PMP Bravo' | 'PMP Charlie' | 'PMP Delta';

export type AssistidaDoc = {
  id: string;
  ativa?: boolean;
  nomeCompleto?: string;
  grauRisco?: string; // "Alto" | "Médio" | "Baixo" etc
  dataValidadeMedida?: any; // ms number ou Timestamp
  latitude?: number;
  longitude?: number;
  [key: string]: any;
};

export type VisitaDoc = {
  id: string;
  idAssistida: string;
  dataHora: any; // ms number ou Timestamp
  guarnicao?: string;
  houveDescumprimento?: boolean;
  detalhesDescumprimento?: string | null;
  situacaoEncontrada?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: any;
};

export type AgendaPlanejadaDoc = {
  id: string;
  guarnicao: string;
  idAssistida: string;
  dataDia?: string; // "YYYY-MM-DD"
  data?: any; // ms number ou Timestamp
  chaveDiaGuarnicao?: string;
  ordem?: number;
  observacoes?: string | null;
  [key: string]: any;
};

function listenQuery<T>(
  q: Query<DocumentData>,
  mapFn: (id: string, data: DocumentData) => T,
  onData: (items: T[]) => void,
  onError?: (err: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => mapFn(d.id, d.data()))),
    (err) => onError?.(err),
  );
}

export function toMillis(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return null;
}

export function toDayKeyBR(ms: number): string {
  const d = new Date(ms);
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// ---------------------- LISTENERS ----------------------

export function listenAssistidasAtivas(
  onData: (items: AssistidaDoc[]) => void,
  onError?: (msg: string) => void,
) {
  const q = query(
    collection(db, 'assistidas'),
    where('ativa', '==', true),
    limit(5000),
  );
  return listenQuery(
    q,
    (id, data) => ({ id, ...(data as any) }),
    onData,
    (e) => onError?.(e.message),
  );
}

export function listenAgendasRange(
  startDay: string,
  endDay: string,
  guarnicao: string | 'Todas',
  onData: (items: AgendaPlanejadaDoc[]) => void,
  onError?: (msg: string) => void,
) {
  const base = [
    collection(db, 'agendas_planejadas'),
    where('dataDia', '>=', startDay),
    where('dataDia', '<=', endDay),
    orderBy('dataDia', 'asc'),
    limit(5000),
  ] as const;

  const q =
    guarnicao === 'Todas'
      ? query(...base)
      : query(...base, where('guarnicao', '==', guarnicao));

  return listenQuery(
    q,
    (id, data) => ({ id, ...(data as any) }),
    onData,
    (e) => onError?.(e.message),
  );
}

export function listenVisitasRange(
  startMs: number,
  endMsExclusive: number,
  guarnicao: string | 'Todas',
  onData: (items: VisitaDoc[]) => void,
  onError?: (msg: string) => void,
) {
  const base = [
    collection(db, 'visitas'),
    where('dataHora', '>=', startMs),
    where('dataHora', '<', endMsExclusive),
    orderBy('dataHora', 'asc'),
    limit(5000),
  ] as const;

  const q =
    guarnicao === 'Todas'
      ? query(...base)
      : query(...base, where('guarnicao', '==', guarnicao));

  return listenQuery(
    q,
    (id, data) => ({ id, ...(data as any) }),
    onData,
    (e) => onError?.(e.message),
  );
}

// Para alertas “sem visita há X dias”, é melhor ter uma janela maior fixa (ex.: 120 dias)
export function listenVisitasUltimosNDias(
  dias: number,
  onData: (items: VisitaDoc[]) => void,
  onError?: (msg: string) => void,
) {
  const now = new Date();
  const start = startOfDayMs(addDays(now, -dias));
  const end = startOfDayMs(addDays(now, 1));

  const q = query(
    collection(db, 'visitas'),
    where('dataHora', '>=', start),
    where('dataHora', '<', end),
    orderBy('dataHora', 'asc'),
    limit(5000),
  );

  return listenQuery(
    q,
    (id, data) => ({ id, ...(data as any) }),
    onData,
    (e) => onError?.(e.message),
  );
}
