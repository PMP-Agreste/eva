import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AgendaPlanejada, Assistida, Visita } from '../types/models';

type GuarnicaoKey = 'Todos' | 'PMP Alfa' | 'PMP Bravo' | 'PMP Charlie' | 'PMP Delta';

const GUARNICOES: GuarnicaoKey[] = ['Todos', 'PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'];

type AgendaItem = AgendaPlanejada & {
  dataDia?: string; // "YYYY-MM-DD"
  idAssistida?: string;
  observacoes?: string | null;
  ordem?: number;
  guarnicao?: string;
  chaveDiaGuarnicao?: string;
};

type VisitaItem = Visita & {
  dataHora?: unknown; // number(ms) ou Timestamp-like
  idAssistida?: string;
  guarnicao?: string;
  latitude?: number;
  longitude?: number;
};

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

function mapsLink(lat?: number, lng?: number) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

export function AgendaPlanejadaPage() {
  const [dataStr, setDataStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  });

  const [guarnicao, setGuarnicao] = useState<GuarnicaoKey>('Todos');
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agendas, setAgendas] = useState<AgendaItem[]>([]);
  const [visitasDia, setVisitasDia] = useState<VisitaItem[]>([]);
  const [assistidasMap, setAssistidasMap] = useState<Record<string, Assistida>>({});

  const [reloadKey, setReloadKey] = useState(0);

  const dayRange = useMemo(() => {
    const base = new Date(`${dataStr}T00:00:00`);
    const from = startOfDay(Number.isNaN(base.getTime()) ? new Date() : base);
    const to = addDays(from, 1);
    return { from, to };
  }, [dataStr]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) Agendas planejadas do dia
        // - Se "Todos": usa dataDia == YYYY-MM-DD
        // - Se guarnição específica: usa chaveDiaGuarnicao == YYYY-MM-DD|Guarnição (mais direto)
        const agendasCol = collection(db, 'agendas_planejadas');

        let agendaDocs: AgendaItem[] = [];

        if (guarnicao === 'Todos') {
          const qAg = query(agendasCol, where('dataDia', '==', dataStr));
          const snap = await getDocs(qAg);
          agendaDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];
        } else {
          const chave = `${dataStr}|${guarnicao}`;
          const qAg = query(agendasCol, where('chaveDiaGuarnicao', '==', chave));
          const snap = await getDocs(qAg);
          agendaDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];

          // fallback: se por algum motivo a chave não existir, tenta dataDia + filtro client
          if (agendaDocs.length === 0) {
            const qAg2 = query(agendasCol, where('dataDia', '==', dataStr));
            const snap2 = await getDocs(qAg2);
            const all = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];
            agendaDocs = all.filter((a) => String(a.guarnicao ?? '').trim() === guarnicao);
          }
        }

        // ordena localmente (evita índice composto)
        agendaDocs.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));

        // 2) Visitas do mesmo dia (todas as guarnições)
        const fromMs = dayRange.from.getTime();
        const toMs = dayRange.to.getTime();

        const visitasCol = collection(db, 'visitas');
        const qVis = query(
          visitasCol,
          where('dataHora', '>=', fromMs),
          where('dataHora', '<', toMs),
        );
        const visSnap = await getDocs(qVis);
        const visDocs = visSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VisitaItem[];

        // 3) Assistidas referenciadas (somente as do dia)
        const idsAssistidas = Array.from(
          new Set(agendaDocs.map((a) => String(a.idAssistida ?? '')).filter(Boolean)),
        );

        const assistidasObj: Record<string, Assistida> = {};
        await Promise.all(
          idsAssistidas.map(async (id) => {
            try {
              const s = await getDoc(doc(db, 'assistidas', id));
              if (s.exists()) assistidasObj[id] = { id: s.id, ...(s.data() as any) } as Assistida;
            } catch {
              // ignora erro individual (permissão / doc inexistente)
            }
          }),
        );

        if (!alive) return;

        setAgendas(agendaDocs);
        setVisitasDia(visDocs);
        setAssistidasMap(assistidasObj);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? 'Falha ao carregar agenda/visitas.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [dataStr, guarnicao, dayRange.from, dayRange.to, reloadKey]);

  // Sets de “cumprida”
  const computed = useMemo(() => {
    const anyVisit = new Set<string>();
    const byGuarnicao = new Map<string, Set<string>>();

    for (const v of visitasDia) {
      const aid = String(v.idAssistida ?? '').trim();
      if (!aid) continue;

      anyVisit.add(aid);

      const g = String(v.guarnicao ?? '').trim();
      if (g) {
        if (!byGuarnicao.has(g)) byGuarnicao.set(g, new Set());
        byGuarnicao.get(g)!.add(aid);
      }
    }

    return { anyVisit, byGuarnicao };
  }, [visitasDia]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();

    return agendas
      .map((a, idx) => {
        const idAssistida = String(a.idAssistida ?? '').trim();
        const g = String(a.guarnicao ?? '').trim();

        const doneAny = !!idAssistida && computed.anyVisit.has(idAssistida);
        const doneSame = !!idAssistida && !!g && (computed.byGuarnicao.get(g)?.has(idAssistida) ?? false);

        const asst = idAssistida ? assistidasMap[idAssistida] : undefined;
        const nome = String(asst?.nomeCompleto ?? '').trim();
        const processo = String((asst as any)?.numeroProcesso ?? '').trim();
        const risco = String((asst as any)?.grauRisco ?? '').trim();

        const lat = (asst as any)?.latitude as number | undefined;
        const lng = (asst as any)?.longitude as number | undefined;
        const map = mapsLink(lat, lng);

        // filtro texto
        if (s) {
          const blob = [a.id, idAssistida, g, nome, processo, risco, a.chaveDiaGuarnicao]
            .map((x) => String(x ?? '').toLowerCase())
            .join(' | ');
          if (!blob.includes(s)) return null;
        }

        // somente pendentes (critério: sem visita no dia)
        if (onlyPending && doneAny) return null;

        return {
          idx: idx + 1,
          agenda: a,
          idAssistida,
          guarnicao: g || '—',
          nome: nome || '—',
          processo: processo || '—',
          risco: risco || '—',
          doneAny,
          doneSame,
          map,
        };
      })
      .filter(Boolean) as Array<{
      idx: number;
      agenda: AgendaItem;
      idAssistida: string;
      guarnicao: string;
      nome: string;
      processo: string;
      risco: string;
      doneAny: boolean;
      doneSame: boolean;
      map: string | null;
    }>;
  }, [agendas, assistidasMap, computed.anyVisit, computed.byGuarnicao, search, onlyPending]);

  const summary = useMemo(() => {
    const total = agendas.length;
    let doneAny = 0;
    let doneSame = 0;

    for (const a of agendas) {
      const idAssistida = String(a.idAssistida ?? '').trim();
      const g = String(a.guarnicao ?? '').trim();

      if (idAssistida && computed.anyVisit.has(idAssistida)) doneAny += 1;
      if (idAssistida && g && (computed.byGuarnicao.get(g)?.has(idAssistida) ?? false)) doneSame += 1;
    }

    return { total, doneAny, doneSame, pend: total - doneAny };
  }, [agendas, computed.anyVisit, computed.byGuarnicao]);

  const resumoPorGuarnicao = useMemo(() => {
    if (guarnicao !== 'Todos') return null;

    const map: Record<string, { planned: number; doneAny: number; doneSame: number }> = {};
    for (const g of GUARNICOES.filter((x) => x !== 'Todos')) {
      map[g] = { planned: 0, doneAny: 0, doneSame: 0 };
    }

    for (const a of agendas) {
      const g = String(a.guarnicao ?? '').trim();
      if (!g || !map[g]) continue;

      const idAssistida = String(a.idAssistida ?? '').trim();

      map[g].planned += 1;
      if (idAssistida && computed.anyVisit.has(idAssistida)) map[g].doneAny += 1;
      if (idAssistida && (computed.byGuarnicao.get(g)?.has(idAssistida) ?? false)) map[g].doneSame += 1;
    }

    return map;
  }, [agendas, computed.anyVisit, computed.byGuarnicao, guarnicao]);

  return (
    <Card>
      <CardHeader
        title="Agenda planejada"
        subheader={`Dia: ${dataStr} • Itens planejados: ${summary.total}`}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={`Pendentes: ${summary.pend}`} variant={summary.pend ? 'filled' : 'outlined'} />
            <Chip
              label={`Cumpridas (geral): ${summary.doneAny}/${summary.total} (${pct(summary.doneAny, summary.total)}%)`}
              color={summary.doneAny ? 'success' : 'default'}
              variant="outlined"
            />
            <Chip
              label={`Cumpridas (guarnição): ${summary.doneSame}/${summary.total} (${pct(summary.doneSame, summary.total)}%)`}
              color={summary.doneSame ? 'info' : 'default'}
              variant="outlined"
            />
          </Stack>
        }
      />
      <CardContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Data"
            type="date"
            value={dataStr}
            onChange={(e) => setDataStr(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Guarnição</InputLabel>
            <Select
              label="Guarnição"
              value={guarnicao}
              onChange={(e) => setGuarnicao(e.target.value as GuarnicaoKey)}
            >
              {GUARNICOES.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Buscar"
            placeholder="ID, nome, nº processo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 320 }}
          />

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Somente pendentes
            </Typography>
            <Switch checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          </Stack>

          <Button variant="outlined" onClick={() => setReloadKey((x) => x + 1)}>
            Atualizar
          </Button>
        </Box>

        {resumoPorGuarnicao && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Resumo por guarnição (taxa por guarnição = “cumprida pela mesma guarnição”)
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(resumoPorGuarnicao).map(([g, s]) => (
                <Chip
                  key={g}
                  variant="outlined"
                  color={s.planned ? (pct(s.doneSame, s.planned) >= 70 ? 'success' : 'default') : 'default'}
                  label={`${g}: ${s.doneSame}/${s.planned} (${pct(s.doneSame, s.planned)}%)`}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Guarnição</TableCell>
                <TableCell>Assistida</TableCell>
                <TableCell>Risco</TableCell>
                <TableCell>Nº Processo</TableCell>
                <TableCell>Cumprida (geral)</TableCell>
                <TableCell>Cumprida (guarnição)</TableCell>
                <TableCell>Mapa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const geralChip = r.doneAny ? (
                  <Chip size="small" label="Sim" color="success" />
                ) : (
                  <Chip size="small" label="Não" variant="outlined" />
                );

                const guarnicaoChip = r.doneSame ? (
                  <Chip size="small" label="Sim" color="success" />
                ) : r.doneAny ? (
                  <Chip size="small" label="Outra guarnição" color="info" variant="outlined" />
                ) : (
                  <Chip size="small" label="Não" variant="outlined" />
                );

                return (
                  <TableRow key={r.agenda.id} hover>
                    <TableCell>{r.idx}</TableCell>
                    <TableCell>{r.guarnicao}</TableCell>

                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {r.nome}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ID: <code>{r.idAssistida || '—'}</code>
                        </Typography>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={r.risco}
                        color={r.risco.toLowerCase() === 'alto' ? 'warning' : 'default'}
                        variant={r.risco.toLowerCase() === 'alto' ? 'filled' : 'outlined'}
                      />
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {r.processo}
                      </Typography>
                    </TableCell>

                    <TableCell>{geralChip}</TableCell>
                    <TableCell>{guarnicaoChip}</TableCell>

                    <TableCell>
                      {r.map ? (
                        <a href={r.map} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum item com esses filtros.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {/* Observação de critério (para evitar dúvidas do usuário) */}
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">
            Critérios: <b>Cumprida (geral)</b> = existe qualquer visita no mesmo dia para a assistida.{' '}
            <b>Cumprida (guarnição)</b> = existe visita no mesmo dia feita pela mesma guarnição.
          </Alert>
        </Box>
      </CardContent>
    </Card>
  );
}
