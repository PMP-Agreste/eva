import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
  type Query,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';

export async function readDoc<T>(collectionName: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as object) } as T;
}

export function listenQuery<T>(
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

export const qAssistidas = () => query(collection(db, 'assistidas'), orderBy('nomeCompleto'), limit(200));
export const qVisitasRecentes = () => query(collection(db, 'visitas'), orderBy('dataHora', 'desc'), limit(200));
export const qAgendaPorChave = (chaveDiaGuarnicao: string) =>
  query(collection(db, 'agendas_planejadas'), where('chaveDiaGuarnicao', '==', chaveDiaGuarnicao), limit(200));
