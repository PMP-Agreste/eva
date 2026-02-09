import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Assistida, AgendaPlanejada, Visita } from '../types/models';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PeriodKey = 'hoje' | '7d' | '30d';

const GUARNICOES = ['PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

type AgendaRow = AgendaPlanejada & {
  idAssistida?: string;
  dataDia?: string; // "YYYY-MM-DD"
};

type VisitaRow = Visita & {
  latitude?: number;
  longitude?: number;
  houveDescumprimento?: boolean;
  idAssistida?: string; // ✅ conforme seu Firestore
  dataHora?: any;       // ✅ number(ms) conforme seu Firestore
};

function two(n: number) {
  return String(n).padStart(2, '0');
}

function dayKeyFromDate(d: Date) {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = two(d.getMonth() + 1);
  const dd = two(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function safeStr(v: unknown) {
  return String(v ?? '').trim();
}

function parseMillis(v: unknown): number | null {
  if (v == null) return null;

  // ✅ seu caso: number em ms
  if (typeof v === 'number' && Number.isFinite(v)) return v;

  // string numérica
  if (typeof v === 'string' && /^\d{10,13}$/.test(v)) return Number(v);

  // Timestamp
  if (v instanceof Timestamp) return v.toMillis();

  // objeto tipo Timestamp
  if (typeof v === 'object' && v) {
    const any = v as any;
    if (typeof any.toMillis === 'function') {
      const ms = Number(any.toMillis());
      return Number.isFinite(ms) ? ms : null;
    }
    if ('seconds' in any) {
      const seconds = Number(any.seconds);
      if (!Number.isFinite(seconds)) return null;
      const nanos = Number(any.nanoseconds ?? 0);
      return seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }

  return null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function makeRange(period: PeriodKey): { start: Date; endExclusive: Date; label: string } {
  const endExclusive = addDays(startOfToday(), 1);
  if (period === 'hoje') return { start: startOfToday(), endExclusive, label: 'Hoje' };
  if (period === '7d') return { start: addDays(startOfToday(), -6), endExclusive, label: 'Últimos 7 dias' };
  return { start: addDays(startOfToday(), -29), endExclusive, label: 'Últimos 30 dias' };
}

function enumerateDayKeys(start: Date, endExclusive: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur.getTime() < endExclusive.getTime()) {
    out.push(dayKeyFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatDayLabel(dayKey: string) {
  const [, m, d] = dayKey.split('-');
  return `${d}/${m}`;
}

function normalizeRisco(v: unknown): 'Alto' | 'Médio' | 'Baixo' | 'Sem' {
  const s = safeStr(v).toLowerCase();
  if (!s) return 'Sem';
  if (s.includes('alto')) return 'Alto';
  if (s.includes('médio') || s.includes('medio')) return 'Médio';
  if (s.includes('baixo')) return 'Baixo';
  return 'Sem';
}

function uniqById<T extends { id: string }>(items: T[]): T[] {
  const m = new Map<string, T>();
  for (const it of items) m.set(it.id, it);
  return Array.from(m.values());
}

// ✅ chave oficial da assistida (doc.id), com fallback
function getAssistidaKey(a: any): string {
  return safeStr(a?.id) || safeStr(a?.idAssistida) || safeStr(a?.assistidaId) || '';
}

// ✅ seu formato de visita (confirmado)
function getVisitaAssistidaId(v: any): string {
  return safeStr(v?.idAssistida);
}

function getVisitaMs(v: any): number | null {
  return parseMillis(v?.dataHora) ?? null;
}

async function fetchAssistidasAtivas(): Promise<Assistida[]> {
  const snap = await getDocs(query(collection(db, 'assistidas'), where('ativa', '==', true), limit(2000)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Assistida));
}

async function fetchAgendasByDataDiaRange(startKey: string, endKey: string): Promise<AgendaRow[]> {
  const qy = query(
    collection(db, 'agendas_planejadas'),
    where('dataDia', '>=', startKey),
    where('dataDia', '<=', endKey),
    orderBy('dataDia', 'asc'),
    limit(8000),
  );
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AgendaRow));
}

async function fetchVisitasSince(ms: number): Promise<VisitaRow[]> {
  // ✅ como você usa number(ms), essa query é a principal
  const col = collection(db, 'visitas');
  const qNum = query(col, where('dataHora', '>=', ms), orderBy('dataHora', 'desc'), limit(12000));

  // fallback (caso algum doc antigo esteja como Timestamp)
  const qTs = query(col, where('dataHora', '>=', Timestamp.fromMillis(ms)), orderBy('dataHora', 'desc'), limit(12000));

  const results = await Promise.allSettled([getDocs(qNum), getDocs(qTs)]);
  const all: VisitaRow[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    all.push(...r.value.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as VisitaRow)));
  }

  return uniqById(all);
}

function KPICard(props: { title: string; value: ReactNode; helper?: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader
        titleTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
        title={props.title}
        action={props.action}
        sx={{ pb: 0.5 }}
      />
      <CardContent sx={{ pt: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
          {props.value}
        </Typography>
        {props.helper ? (
          <Typography variant="caption" color="text.secondary">
            {props.helper}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const t = useTheme();

  const [period, setPeriod] = useState<PeriodKey>('7d');

  const [assistidas, setAssistidas] = useState<Assistida[]>([]);
  const [visitas120, setVisitas120] = useState<VisitaRow[]>([]);
  const [agendas, setAgendas] = useState<AgendaRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingAgendas, setLoadingAgendas] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAllSemVisita, setShowAllSemVisita] = useState(false);
  const [showAllVencendo, setShowAllVencendo] = useState(false);

  const range = useMemo(() => makeRange(period), [period]);
  const dayKeys = useMemo(() => enumerateDayKeys(range.start, range.endExclusive), [range.start, range.endExclusive]);
  const endInclusiveKey = useMemo(
    () => dayKeys[dayKeys.length - 1] ?? dayKeyFromDate(range.start),
    [dayKeys, range.start],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const [a, v] = await Promise.all([
          fetchAssistidasAtivas(),
          fetchVisitasSince(Date.now() - 120 * 24 * 60 * 60 * 1000),
        ]);

        if (cancelled) return;
        setAssistidas(a);
        setVisitas120(v);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'Falha ao carregar dados do Firestore.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingAgendas(true);
      setError(null);

      try {
        const a = await fetchAgendasByDataDiaRange(dayKeys[0] ?? endInclusiveKey, endInclusiveKey);
        if (cancelled) return;
        setAgendas(a);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'Falha ao carregar agendas planejadas.');
      } finally {
        if (!cancelled) setLoadingAgendas(false);
      }
    }

    if (dayKeys.length) void run();
    return () => {
      cancelled = true;
    };
  }, [dayKeys, endInclusiveKey]);

  const computed = useMemo(() => {
    const startMs = range.start.getTime();
    const endMs = range.endExclusive.getTime();

    // dia -> assistidaId -> guarnições que visitaram
    const idx = new Map<string, Map<string, Set<string>>>();

    const totalVisitasPorDia = new Map<string, number>();
    const visitasGpsPorDia = new Map<string, number>();
    const descumprimentosPorDia = new Map<string, number>();

    // ✅ última visita por assistidaId
    const lastVisitaPorAssistida = new Map<string, number>();

    for (const v of visitas120) {
      const ms = getVisitaMs(v);
      if (ms == null) continue;

      const aid = getVisitaAssistidaId(v);
      if (aid) {
        const cur = lastVisitaPorAssistida.get(aid);
        if (!cur || ms > cur) lastVisitaPorAssistida.set(aid, ms);
      }

      // métricas só do período selecionado
      if (ms < startMs || ms >= endMs) continue;

      const day = dayKeyFromDate(new Date(ms));
      totalVisitasPorDia.set(day, (totalVisitasPorDia.get(day) ?? 0) + 1);

      const lat = (v as any).latitude;
      const lng = (v as any).longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        visitasGpsPorDia.set(day, (visitasGpsPorDia.get(day) ?? 0) + 1);
      }

      if ((v as any).houveDescumprimento === true) {
        descumprimentosPorDia.set(day, (descumprimentosPorDia.get(day) ?? 0) + 1);
      }

      const g = safeStr((v as any).guarnicao);
      if (!aid) continue;

      if (!idx.has(day)) idx.set(day, new Map());
      const m = idx.get(day)!;
      if (!m.has(aid)) m.set(aid, new Set());
      const set = m.get(aid)!;
      if (g) set.add(g);
    }

    // agendas por dia / por guarnição
    const plannedPorDia = new Map<string, AgendaRow[]>();
    const plannedPorGuarnicao = new Map<string, AgendaRow[]>();

    for (const a of agendas) {
      const day = safeStr((a as any).dataDia);
      if (!day) continue;

      if (!plannedPorDia.has(day)) plannedPorDia.set(day, []);
      plannedPorDia.get(day)!.push(a);

      const g = safeStr((a as any).guarnicao);
      if (g) {
        if (!plannedPorGuarnicao.has(g)) plannedPorGuarnicao.set(g, []);
        plannedPorGuarnicao.get(g)!.push(a);
      }
    }

    const series = dayKeys.map((day) => {
      const planned = plannedPorDia.get(day) ?? [];
      let cumpridasAny = 0;
      let cumpridasSame = 0;

      for (const p of planned) {
        const aid = safeStr((p as any).idAssistida);
        const gPlan = safeStr((p as any).guarnicao);
        if (!aid) continue;

        const byAssist = idx.get(day)?.get(aid);
        if (!byAssist) continue;

        cumpridasAny += 1;
        if (gPlan && byAssist.has(gPlan)) cumpridasSame += 1;
      }

      return {
        dayKey: day,
        dia: formatDayLabel(day),
        planejadas: planned.length,
        cumpridas: cumpridasAny,
        cumpridasGuarnicao: cumpridasSame,
        visitas: totalVisitasPorDia.get(day) ?? 0,
        gps: visitasGpsPorDia.get(day) ?? 0,
        desc: descumprimentosPorDia.get(day) ?? 0,
      };
    });

    const totais = series.reduce(
      (acc, r) => {
        acc.planejadas += r.planejadas;
        acc.cumpridas += r.cumpridas;
        acc.cumpridasGuarnicao += r.cumpridasGuarnicao;
        acc.visitas += r.visitas;
        acc.gps += r.gps;
        acc.desc += r.desc;
        return acc;
      },
      { planejadas: 0, cumpridas: 0, cumpridasGuarnicao: 0, visitas: 0, gps: 0, desc: 0 },
    );

    const taxaGeral = totais.planejadas ? totais.cumpridas / totais.planejadas : 0;
    const taxaGuarnicao = totais.planejadas ? totais.cumpridasGuarnicao / totais.planejadas : 0;

    const taxaPorGuarnicao = GUARNICOES.map((g) => {
      const planned = plannedPorGuarnicao.get(g) ?? [];
      let ok = 0;

      for (const p of planned) {
        const aid = safeStr((p as any).idAssistida);
        const day = safeStr((p as any).dataDia);
        if (!aid || !day) continue;

        const byAssist = idx.get(day)?.get(aid);
        if (byAssist && byAssist.has(g)) ok += 1;
      }

      return {
        guarnicao: g,
        planejadas: planned.length,
        cumpridas: ok,
        taxa: planned.length ? Math.round((ok / planned.length) * 1000) / 10 : 0,
      };
    });

    const riscoCounts = { Alto: 0, Médio: 0, Baixo: 0, Sem: 0 };
    for (const a of assistidas) {
      const risco = normalizeRisco((a as any).grauRisco ?? (a as any).risco ?? (a as any).nivelRisco);
      riscoCounts[risco] += 1;
    }
    const riscoChart = (Object.keys(riscoCounts) as Array<keyof typeof riscoCounts>)
      .map((k) => ({ name: k === 'Sem' ? 'Sem classificação' : k, value: riscoCounts[k] }))
      .filter((x) => x.value > 0);

    const now = Date.now();
    const ms45d = 45 * 24 * 60 * 60 * 1000;

    // ✅ ALERTA 1: sem visita há 45 dias
    const alertasSemVisita = assistidas
      .map((a) => {
        const key = getAssistidaKey(a);
        const last = key ? (lastVisitaPorAssistida.get(key) ?? 0) : 0;
        const dias = last ? Math.floor((now - last) / (24 * 60 * 60 * 1000)) : 9999;

        return {
          id: a.id,
          key,
          nome: safeStr((a as any).nomeCompleto) || a.id,
          ultimaVisitaMs: last || null,
          diasSemVisita: dias,
          risco: normalizeRisco((a as any).grauRisco ?? (a as any).risco ?? (a as any).nivelRisco),
        };
      })
      .filter((x) => !x.ultimaVisitaMs || now - (x.ultimaVisitaMs ?? 0) >= ms45d)
      .sort((a, b) => (b.diasSemVisita ?? 0) - (a.diasSemVisita ?? 0));

    // ✅ ALERTA 2: medida vencendo (até 7 dias)
    const alertasMedidaVencendo = assistidas
      .map((a) => {
        const v =
          (a as any).dataValidadeMedida ??
          (a as any).validadeMedida ??
          (a as any).validadeMedidaProtetiva ??
          null;

        const ms = parseMillis(v);
        if (!ms) return null;

        const diff = ms - now;
        const dias = Math.ceil(diff / (24 * 60 * 60 * 1000));

        return {
          id: a.id,
          nome: safeStr((a as any).nomeCompleto) || a.id,
          validadeMs: ms,
          diasParaVencer: dias,
          tipo: safeStr((a as any).tipoMedidaPrincipal) || safeStr((a as any).tipoMedida) || '—',
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .filter((x) => x.diasParaVencer >= 0 && x.diasParaVencer <= 7)
      .sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    return {
      series,
      totais,
      taxaGeral,
      taxaGuarnicao,
      taxaPorGuarnicao,
      riscoChart,
      alertasSemVisita,
      alertasMedidaVencendo,
    };
  }, [assistidas, agendas, dayKeys, range.endExclusive, range.start, visitas120]);

  const periodChips = (
    <ToggleButtonGroup
      value={period}
      exclusive
      onChange={(_, v) => v && setPeriod(v)}
      size="small"
      sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.7, borderColor: 'rgba(255,255,255,0.14)' } }}
    >
      <ToggleButton value="hoje">Hoje</ToggleButton>
      <ToggleButton value="7d">7 dias</ToggleButton>
      <ToggleButton value="30d">30 dias</ToggleButton>
    </ToggleButtonGroup>
  );

  const pieColors = [t.palette.error.main, t.palette.warning.main, t.palette.success.main, t.palette.text.secondary];

  const totalSemVisita = computed.alertasSemVisita.length;
  const semVisitaToShow = showAllSemVisita ? computed.alertasSemVisita : computed.alertasSemVisita.slice(0, 12);

  const totalVencendo = computed.alertasMedidaVencendo.length;
  const vencendoToShow = showAllVencendo ? computed.alertasMedidaVencendo : computed.alertasMedidaVencendo.slice(0, 12);

  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader
          title="Dashboard"
          subheader={`Visão operacional • ${range.label}`}
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              {periodChips}
              <Button component={RouterLink} to="/visitas" variant="outlined" size="small">
                Ver visitas
              </Button>
            </Stack>
          }
        />
        <CardContent>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {(loading || loadingAgendas) && !error ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip label="Carregando dados do Firestore…" />
            </Box>
          ) : null}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Critérios: <b>cumprida (geral)</b> = existe qualquer visita no mesmo dia para a assistida planejada;{' '}
            <b>cumprida (guarnição)</b> = visita no mesmo dia feita pela mesma guarnição.
          </Typography>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title="Planejadas no período" value={computed.totais.planejadas} helper={`Base: agendas_planejadas (${range.label})`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title="Cumpridas (geral)" value={`${computed.totais.cumpridas} • ${(computed.taxaGeral * 100).toFixed(1)}%`} helper="Qualquer guarnição" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title="Cumpridas (guarnição)" value={`${computed.totais.cumpridasGuarnicao} • ${(computed.taxaGuarnicao * 100).toFixed(1)}%`} helper="Mesma guarnição" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title="Visitas registradas" value={computed.totais.visitas} helper={<span>GPS: <b>{computed.totais.gps}</b> • Desc: <b>{computed.totais.desc}</b></span>} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardHeader title="Evolução por dia" subheader="Planejadas x Cumpridas x Visitas (registradas)" />
            <CardContent sx={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={computed.series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="dia" />
                  <YAxis allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{
                      background: t.palette.background.paper,
                      border: `1px solid ${t.palette.divider}`,
                      borderRadius: 10,
                      color: t.palette.text.primary,
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="planejadas" stroke={t.palette.secondary.main} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cumpridas" stroke={t.palette.primary.main} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="visitas" stroke={t.palette.text.secondary} strokeWidth={2} dot={false} opacity={0.65} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Card>
            <CardHeader
              title="Assistidas por nível de risco"
              subheader={`Ativas: ${assistidas.length}`}
              action={
                <Button component={RouterLink} to="/assistidas" size="small">
                  Ver assistidas
                </Button>
              }
            />
            <CardContent sx={{ height: 360 }}>
              {loading ? (
                <Chip label="Carregando…" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <ReTooltip
                      contentStyle={{
                        background: t.palette.background.paper,
                        border: `1px solid ${t.palette.divider}`,
                        borderRadius: 10,
                        color: t.palette.text.primary,
                      }}
                    />
                    <Legend />
                    <Pie data={computed.riscoChart} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                      {computed.riscoChart.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ALERTA 1: SEM VISITA */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader
              title="Alertas: Sem visita"
              subheader="Regra: assistidas sem visita há 45 dias (qualquer risco)"
              action={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={`${totalSemVisita}`} />
                  {totalSemVisita > 12 ? (
                    <Button size="small" variant="outlined" onClick={() => setShowAllSemVisita((s) => !s)}>
                      {showAllSemVisita ? 'Ver menos' : `Ver mais (${totalSemVisita})`}
                    </Button>
                  ) : null}
                </Stack>
              }
            />
            <CardContent>
              {totalSemVisita === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sem alertas no momento.
                </Typography>
              ) : (
                <Stack spacing={1} divider={<Divider flexItem />}>
                  {semVisitaToShow.map((a) => (
                    <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {a.nome}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ID: {a.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Risco: {a.risco === 'Sem' ? 'Sem classificação' : a.risco}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 900 }}>
                          {a.diasSemVisita >= 9990 ? 'Sem visitas' : `${a.diasSemVisita} dias`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.ultimaVisitaMs ? new Date(a.ultimaVisitaMs).toLocaleDateString('pt-BR') : '—'}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ALERTA 2: MEDIDA VENCENDO */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader
              title="Alertas: Medida protetiva vencendo"
              subheader="Regra: vencendo em até 7 dias"
              action={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={`${totalVencendo}`} />
                  {totalVencendo > 12 ? (
                    <Button size="small" variant="outlined" onClick={() => setShowAllVencendo((s) => !s)}>
                      {showAllVencendo ? 'Ver menos' : `Ver mais (${totalVencendo})`}
                    </Button>
                  ) : null}
                </Stack>
              }
            />
            <CardContent>
              {totalVencendo === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sem alertas no momento.
                </Typography>
              ) : (
                <Stack spacing={1} divider={<Divider flexItem />}>
                  {vencendoToShow.map((a) => (
                    <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {a.nome}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.tipo}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 900 }}>{a.diasParaVencer} dias</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(a.validadeMs).toLocaleDateString('pt-BR')}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
