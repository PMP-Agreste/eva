import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import {
  CollectionReference,
  DocumentData,
  Query,
  QueryConstraint,
  QueryDocumentSnapshot,
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

type PeriodKey = 'hoje' | '7d' | '30d';
type DescKey = 'todos' | 'com' | 'sem';

// Mantive a lista como fallback
const GUARNICOES = ['Todos', 'PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

const PAGE_SIZE = 30;

type VisitaDoc = {
  dataHora: number; // ms
  guarnicao?: string;
  idAssistida?: string;

  idAutor?: string | null;

  houveDescumprimento?: boolean;
  detalhesDescumprimento?: string | null;

  situacaoEncontrada?: string | null;
  observacoesGerais?: string | null;

  latitude?: number;
  longitude?: number;
};

type Visita = { id: string } & Partial<VisitaDoc>;

type AssistidaMini = {
  nomeCompleto?: string | null;
  numeroProcesso?: string | null;
};

const visitasCol = collection(db, 'visitas') as CollectionReference<VisitaDoc>;
const assistidasCol = collection(db, 'assistidas') as CollectionReference<DocumentData>;

function two(n: number) {
  return String(n).padStart(2, '0');
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function toDateMs(v: unknown): Date | null {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
  return null;
}

function mapsLink(lat?: number, lng?: number) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function norm(v: any) {
  return String(v ?? '').trim().toLowerCase();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // silencioso por enquanto
  }
}

export function VisitasPage() {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [guarnicao, setGuarnicao] = useState<(typeof GUARNICOES)[number]>('Todos');
  const [desc, setDesc] = useState<DescKey>('todos');

  // Busca com debounce
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Dados (paginados)
  const [items, setItems] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<VisitaDoc> | null>(null);

  // Lookup: idAssistida -> nome/proc
  const [assistidasMap, setAssistidasMap] = useState<Record<string, AssistidaMini>>({});

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    if (period === 'hoje') return { from: today, to: addDays(today, 1) };
    if (period === '7d') return { from: addDays(today, -6), to: addDays(today, 1) };
    return { from: addDays(today, -29), to: addDays(today, 1) };
  }, [period]);

  // Debounce da busca
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  function buildBaseQuery(): Query<VisitaDoc> {
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();

    const constraints: QueryConstraint[] = [
      where('dataHora', '>=', fromMs),
      where('dataHora', '<', toMs),
    ];

    if (guarnicao !== 'Todos') {
      constraints.push(where('guarnicao', '==', guarnicao));
    }

    if (desc === 'com') constraints.push(where('houveDescumprimento', '==', true));
    if (desc === 'sem') constraints.push(where('houveDescumprimento', '==', false));

    // orderBy no mesmo campo do range
    constraints.push(orderBy('dataHora', 'desc'));

    return query(visitasCol, ...constraints);
  }

  async function ensureAssistidasLoaded(visitas: Visita[]) {
    const ids = Array.from(
      new Set(
        visitas
          .map((v) => String(v.idAssistida ?? '').trim())
          .filter((id) => !!id && !assistidasMap[id]),
      ),
    );

    if (ids.length === 0) return;

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

    const next: Record<string, AssistidaMini> = {};

    for (const c of chunks) {
      const qA = query(assistidasCol, where(documentId(), 'in', c));
      const snap = await getDocs(qA);

      snap.docs.forEach((d) => {
        const data = d.data() as any;
        next[d.id] = {
          nomeCompleto: data?.nomeCompleto ?? null,
          numeroProcesso: data?.numeroProcesso ?? null,
        };
      });
    }

    setAssistidasMap((m) => ({ ...m, ...next }));
  }

  async function loadFirstPage() {
    setLoading(true);
    setError(null);

    try {
      lastDocRef.current = null;
      setHasMore(false);
      setItems([]);

      const base = buildBaseQuery();
      const q1 = query(base, limit(PAGE_SIZE));
      const snap = await getDocs(q1);

      const list: Visita[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems(list);

      const last = snap.docs[snap.docs.length - 1] ?? null;
      lastDocRef.current = last;

      setHasMore(snap.size === PAGE_SIZE);

      await ensureAssistidasLoaded(list);
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao carregar visitas.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore) return;
    if (!hasMore) return;

    const last = lastDocRef.current;
    if (!last) return;

    setLoadingMore(true);
    setError(null);

    try {
      const base = buildBaseQuery();
      const q2 = query(base, startAfter(last), limit(PAGE_SIZE));
      const snap = await getDocs(q2);

      const list: Visita[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems((prev) => [...prev, ...list]);

      const newLast = snap.docs[snap.docs.length - 1] ?? null;
      lastDocRef.current = newLast;

      setHasMore(snap.size === PAGE_SIZE);

      await ensureAssistidasLoaded(list);
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao carregar mais visitas.');
    } finally {
      setLoadingMore(false);
    }
  }

  // Recarrega quando filtros mudarem
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await loadFirstPage();
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, guarnicao, desc]);

  // Busca local (somente no que já foi carregado)
  const filtered = useMemo(() => {
    const s = norm(search);
    if (!s) return items;

    return items.filter((v) => {
      const a = v.idAssistida ? assistidasMap[v.idAssistida] : undefined;

      const blob = [
        v.id,
        v.idAssistida,
        a?.nomeCompleto,
        a?.numeroProcesso,
        v.guarnicao,
        v.situacaoEncontrada,
        v.observacoesGerais,
        v.detalhesDescumprimento,
        v.idAutor,
      ]
        .map((x) => norm(x))
        .join(' | ');

      return blob.includes(s);
    });
  }, [items, search, assistidasMap]);

  const periodLabel = `Período: ${dateKey(range.from)} até ${dateKey(addDays(range.to, -1))}`;

  return (
    <Card>
      <CardHeader
        title="Visitas"
        subheader={periodLabel}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={loading ? 'Carregando...' : `${filtered.length} registros (carregados)`} />
            {hasMore && <Chip variant="outlined" label="Há mais" />}
          </Box>
        }
      />

      <CardContent>
        {(loading || loadingMore) && <LinearProgress sx={{ mb: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Período</InputLabel>
            <Select label="Período" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              <MenuItem value="hoje">Hoje</MenuItem>
              <MenuItem value="7d">Últimos 7 dias</MenuItem>
              <MenuItem value="30d">Últimos 30 dias</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Guarnição</InputLabel>
            <Select
              label="Guarnição"
              value={guarnicao}
              onChange={(e) => setGuarnicao(e.target.value as (typeof GUARNICOES)[number])}
            >
              {GUARNICOES.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Descumprimento</InputLabel>
            <Select label="Descumprimento" value={desc} onChange={(e) => setDesc(e.target.value as DescKey)}>
              <MenuItem value="todos">Todos</MenuItem>
              <MenuItem value="com">Com descumprimento</MenuItem>
              <MenuItem value="sem">Sem descumprimento</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Buscar"
            placeholder="ID, assistida, processo, guarnição, situação..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchInput('');
            }}
            sx={{ minWidth: 360 }}
            InputProps={{
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <Tooltip title="Limpar (Esc)">
                    <IconButton size="small" onClick={() => setSearchInput('')} edge="end">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : undefined,
            }}
          />
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data/Hora</TableCell>
                <TableCell>Guarnição</TableCell>
                <TableCell>Assistida</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell>Descumprimento</TableCell>
                <TableCell>Mapa</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {filtered.map((v) => {
                const dt = toDateMs(v.dataHora);
                const when = dt ? dt.toLocaleString('pt-BR') : '—';
                const map = mapsLink(v.latitude, v.longitude);

                const a = v.idAssistida ? assistidasMap[v.idAssistida] : undefined;
                const nome = a?.nomeCompleto ?? '—';
                const proc = a?.numeroProcesso ?? null;

                const hasDetails =
                  !!(v.detalhesDescumprimento && String(v.detalhesDescumprimento).trim()) ||
                  !!(v.observacoesGerais && String(v.observacoesGerais).trim());

                return (
                  <TableRow key={v.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{when}</TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{v.guarnicao ?? '—'}</TableCell>

                    <TableCell sx={{ minWidth: 260 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {nome}
                      </Typography>

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {proc ? `Proc: ${proc}` : ''}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
                        {v.situacaoEncontrada ?? '—'}
                      </Typography>
                      {v.idAutor ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Autor: <code>{v.idAutor}</code>
                        </Typography>
                      ) : null}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {v.houveDescumprimento ? (
                        <Chip size="small" label="Sim" />
                      ) : (
                        <Chip size="small" label="Não" variant="outlined" />
                      )}

                      {hasDetails && (
                        <Tooltip
                          title={
                            <Box sx={{ maxWidth: 520 }}>
                              {v.detalhesDescumprimento ? (
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                  <b>Detalhes:</b> {v.detalhesDescumprimento}
                                </Typography>
                              ) : null}
                              {v.observacoesGerais ? (
                                <Typography variant="body2">
                                  <b>Observações:</b> {v.observacoesGerais}
                                </Typography>
                              ) : null}
                            </Box>
                          }
                        >
                          <Chip sx={{ ml: 1 }} size="small" variant="outlined" label="ver detalhes" />
                        </Tooltip>
                      )}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {map ? (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <a href={map} target="_blank" rel="noreferrer">
                            Abrir
                          </a>

                          {typeof v.latitude === 'number' && typeof v.longitude === 'number' && (
                            <Tooltip title="Copiar coordenadas">
                              <IconButton
                                size="small"
                                onClick={() => copyText(`${v.latitude},${v.longitude}`)}
                                aria-label="Copiar coordenadas"
                              >
                                <ContentCopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum registro com esses filtros (ou ainda não carregou itens suficientes para a busca).
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          {hasMore ? (
            <Button variant="outlined" onClick={loadMore} disabled={loadingMore || loading}>
              Carregar mais
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {items.length > 0 ? 'Fim da lista (para o período/filtros atuais).' : ''}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
