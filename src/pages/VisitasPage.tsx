import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

type PeriodKey = 'hoje' | '7d' | '30d';
const GUARNICOES = ['Todos', 'PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

type DescKey = 'todos' | 'com' | 'sem';

type Visita = {
  id: string;
  dataHora?: unknown; // number(ms) ou Timestamp-like
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

function two(n: number) {
  return String(n).padStart(2, '0');
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;

  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);

  if (typeof v === 'object' && v) {
    const anyV = v as any;
    if (typeof anyV.toDate === 'function') {
      const d = anyV.toDate();
      return d instanceof Date ? d : null;
    }
    if (typeof anyV.seconds === 'number') return new Date(anyV.seconds * 1000);
  }

  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
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

function mapsLink(lat?: number, lng?: number) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function VisitasPage() {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [guarnicao, setGuarnicao] = useState<(typeof GUARNICOES)[number]>('Todos');
  const [desc, setDesc] = useState<DescKey>('todos');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Visita[]>([]);

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    if (period === 'hoje') return { from: today, to: addDays(today, 1) };
    if (period === '7d') return { from: addDays(today, -6), to: addDays(today, 1) };
    return { from: addDays(today, -29), to: addDays(today, 1) };
  }, [period]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const fromMs = range.from.getTime();
        const toMs = range.to.getTime();

        // Consulta por período apenas (evita necessidade de índice composto por guarnição)
        const qVis = query(
          collection(db, 'visitas'),
          where('dataHora', '>=', fromMs),
          where('dataHora', '<', toMs),
          orderBy('dataHora', 'desc'),
        );

        const snap = await getDocs(qVis);
        if (!alive) return;

        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Visita[];
        setItems(list);
      } catch (e: any) {
        setError(e?.message ?? 'Falha ao carregar visitas.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const gSel = guarnicao !== 'Todos' ? guarnicao.trim().toLowerCase() : null;

    return items.filter((v) => {
      // filtro guarnição
      if (gSel) {
        const vg = String(v.guarnicao ?? '').trim().toLowerCase();
        if (vg !== gSel) return false;
      }

      // filtro descumprimento
      if (desc === 'com' && v.houveDescumprimento !== true) return false;
      if (desc === 'sem' && v.houveDescumprimento === true) return false;

      // busca texto
      if (!s) return true;
      const blob = [
        v.id,
        v.idAssistida,
        v.guarnicao,
        v.situacaoEncontrada,
        v.observacoesGerais,
        v.detalhesDescumprimento,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' | ');
      return blob.includes(s);
    });
  }, [items, search, guarnicao, desc]);

  return (
    <Card>
      <CardHeader
        title="Visitas"
        subheader={`Período: ${dateKey(range.from)} até ${dateKey(addDays(range.to, -1))}`}
        action={<Chip label={loading ? 'Carregando...' : `${filtered.length} registros`} />}
      />
      <CardContent>
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
            placeholder="ID, assistida, guarnição, situação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 320 }}
          />
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data/Hora</TableCell>
                <TableCell>Guarnição</TableCell>
                <TableCell>Assistida (ID)</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell>Descumprimento</TableCell>
                <TableCell>Mapa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((v) => {
                const dt = toDateSafe(v.dataHora);
                const when = dt ? dt.toLocaleString('pt-BR') : '—';
                const map = mapsLink(v.latitude, v.longitude);

                return (
                  <TableRow key={v.id} hover>
                    <TableCell>{when}</TableCell>
                    <TableCell>{v.guarnicao ?? '—'}</TableCell>
                    <TableCell>
                      <code>{v.idAssistida ?? '—'}</code>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
                        {v.situacaoEncontrada ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {v.houveDescumprimento ? (
                        <Chip size="small" label="Sim" />
                      ) : (
                        <Chip size="small" label="Não" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {map ? (
                        <a href={map} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum registro com esses filtros.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}
