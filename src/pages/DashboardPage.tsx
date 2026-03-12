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
import { Timestamp } from 'firebase/firestore';
import type { Assistida, AgendaPlanejada, Visita } from '../types/models';
import {
  fetchAssistidasAtivasCache,
  fetchVisitasSinceCache,
  fetchAgendasRangeCache,
} from '../services/firestore';


import {
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

import TodayIcon from '@mui/icons-material/Today';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

type PeriodKey = 'hoje' | '7d' | '30d';

const GUARNICOES = ['PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

const ROSE = '#F472B6';
const ROSE_DARK = '#EC4899';
const BLUE = '#60A5FA';

type AgendaRow = AgendaPlanejada & {
  idAssistida?: string;
  dataDia?: string;
};

type VisitaRow = Visita & {
  latitude?: number;
  longitude?: number;
  houveDescumprimento?: boolean;
  idAssistida?: string;
  dataHora?: any;
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
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d{10,13}$/.test(v)) return Number(v);
  if (v instanceof Timestamp) return v.toMillis();
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



function getAssistidaKey(a: any): string {
  return safeStr(a?.id) || safeStr(a?.idAssistida) || safeStr(a?.assistidaId) || '';
}

function getVisitaAssistidaId(v: any): string {
  return safeStr(v?.idAssistida);
}

function getVisitaMs(v: any): number | null {
  return parseMillis(v?.dataHora) ?? null;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: ReactNode;
  helper?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  trend?: string;
  action?: ReactNode;
}

function KPICard({ title, value, helper, icon, accent = ROSE, trend }: KPICardProps) {
  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        },
      }}
    >
      <CardContent sx={{ p: '20px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              color: '#64748B',
              fontWeight: 600,
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              lineHeight: 1.3,
              maxWidth: '75%',
            }}
          >
            {title}
          </Typography>
          {icon && (
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '9px',
                background: `${accent}18`,
                border: `1px solid ${accent}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: accent,
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '1.75rem',
            letterSpacing: '-0.03em',
            color: '#F1F5F9',
            lineHeight: 1,
            mb: helper ? 1 : 0,
          }}
        >
          {value}
        </Typography>

        {helper && (
          <Typography variant="caption" sx={{ color: '#64748B', lineHeight: 1.4, display: 'block' }}>
            {helper}
          </Typography>
        )}

        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5 }}>
            <TrendingUpIcon sx={{ fontSize: 13, color: '#34D399' }} />
            <Typography sx={{ fontSize: '0.6875rem', color: '#34D399', fontWeight: 600 }}>
              {trend}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Alert Row ───────────────────────────────────────────────────────────────

function AlertRow({
  name,
  id,
  badge,
  badgeColor,
  detail,
  rightPrimary,
  rightSecondary,
}: {
  name: string;
  id?: string;
  badge?: string;
  badgeColor?: string;
  detail?: string;
  rightPrimary: string;
  rightSecondary?: string;
}) {
  const bc = badgeColor ?? '#64748B';
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        py: 1.25,
        px: 1.5,
        borderRadius: '8px',
        transition: 'background 0.15s',
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              color: '#E2E8F0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Typography>
          {badge && (
            <Box
              sx={{
                px: 0.75,
                py: 0.125,
                borderRadius: '5px',
                background: `${bc}1A`,
                border: `1px solid ${bc}35`,
                fontSize: '0.6rem',
                fontWeight: 700,
                color: bc,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1.6,
                flexShrink: 0,
              }}
            >
              {badge}
            </Box>
          )}
        </Box>
        {(id || detail) && (
          <Typography variant="caption" sx={{ color: '#475569' }}>
            {id && `#${id}`}
            {id && detail && ' · '}
            {detail}
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.875rem', color: '#F1F5F9', lineHeight: 1.2 }}>
          {rightPrimary}
        </Typography>
        {rightSecondary && (
          <Typography variant="caption" sx={{ color: '#475569' }}>
            {rightSecondary}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
          fetchAssistidasAtivasCache(),
          fetchVisitasSinceCache(Date.now() - 45 * 24 * 60 * 60 * 1000), // 50 dias (alerta usa 45d)
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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingAgendas(true);
      setError(null);
      try {
        const a = await fetchAgendasRangeCache(dayKeys[0] ?? endInclusiveKey, endInclusiveKey);
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
    return () => { cancelled = true; };
  }, [dayKeys, endInclusiveKey]);

  const computed = useMemo(() => {
    const startMs = range.start.getTime();
    const endMs = range.endExclusive.getTime();

    const idx = new Map<string, Map<string, Set<string>>>();
    const totalVisitasPorDia = new Map<string, number>();
    const visitasGpsPorDia = new Map<string, number>();
    const descumprimentosPorDia = new Map<string, number>();
    const lastVisitaPorAssistida = new Map<string, number>();

    for (const v of visitas120) {
      const ms = getVisitaMs(v);
      if (ms == null) continue;

      const aid = getVisitaAssistidaId(v);
      if (aid) {
        const cur = lastVisitaPorAssistida.get(aid);
        if (!cur || ms > cur) lastVisitaPorAssistida.set(aid, ms);
      }

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

    return { series, totais, taxaGeral, taxaGuarnicao, taxaPorGuarnicao, riscoChart, alertasSemVisita, alertasMedidaVencendo };
  }, [assistidas, agendas, dayKeys, range.endExclusive, range.start, visitas120]);

  const pieColors = ['#F87171', '#FBBF24', '#34D399', '#64748B'];

  const totalSemVisita = computed.alertasSemVisita.length;
  const semVisitaToShow = showAllSemVisita ? computed.alertasSemVisita : computed.alertasSemVisita.slice(0, 8);
  const totalVencendo = computed.alertasMedidaVencendo.length;
  const vencendoToShow = showAllVencendo ? computed.alertasMedidaVencendo : computed.alertasMedidaVencendo.slice(0, 8);

  const isLoading = loading || loadingAgendas;

  return (
    <Stack spacing={3}>
      {/* ── Page Header ───────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1.375rem',
              letterSpacing: '-0.025em',
              color: '#F1F5F9',
              lineHeight: 1.2,
              mb: 0.5,
            }}
          >
            Dashboard
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#64748B' }}>
            Visão operacional — {range.label}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {isLoading && !error && (
            <Chip
              label="Atualizando…"
              size="small"
              sx={{ fontSize: '0.6875rem', height: 22, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.2)', color: BLUE }}
            />
          )}
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_, v) => v && setPeriod(v)}
            size="small"
          >
            <ToggleButton value="hoje">Hoje</ToggleButton>
            <ToggleButton value="7d">7 dias</ToggleButton>
            <ToggleButton value="30d">30 dias</ToggleButton>
          </ToggleButtonGroup>

          <Button
            component={RouterLink}
            to="/visitas"
            variant="outlined"
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
            sx={{ fontSize: '0.75rem' }}
          >
            Ver visitas
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ borderRadius: '10px' }}>
          {error}
        </Alert>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} lg={3}>
          <KPICard
            title="Visitas Planejadas"
            value={computed.totais.planejadas}
            helper={`Período: ${range.label}`}
            icon={<TodayIcon sx={{ fontSize: 17 }} />}
            accent={BLUE}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KPICard
            title="Cumpridas (Geral)"
            value={`${computed.totais.cumpridas}`}
            helper={`Taxa: ${(computed.taxaGeral * 100).toFixed(1)}% — qualquer guarnição`}
            icon={<CheckCircleOutlineIcon sx={{ fontSize: 17 }} />}
            accent="#34D399"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KPICard
            title="Cumpridas (Guarnição)"
            value={`${computed.totais.cumpridasGuarnicao}`}
            helper={`Taxa: ${(computed.taxaGuarnicao * 100).toFixed(1)}% — mesma guarnição`}
            icon={<VerifiedOutlinedIcon sx={{ fontSize: 17 }} />}
            accent={ROSE}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KPICard
            title="Visitas Registradas"
            value={computed.totais.visitas}
            helper={
              <Box component="span" sx={{ display: 'inline-flex', gap: 1.5 }}>
                <span>
                  GPS:{' '}
                  <Box component="strong" sx={{ color: '#94A3B8' }}>
                    {computed.totais.gps}
                  </Box>
                </span>
                <span>
                  Desc.:{' '}
                  <Box component="strong" sx={{ color: computed.totais.desc > 0 ? '#FBBF24' : '#94A3B8' }}>
                    {computed.totais.desc}
                  </Box>
                </span>
              </Box>
            }
            icon={<DirectionsWalkIcon sx={{ fontSize: 17 }} />}
            accent="#FBBF24"
          />
        </Grid>
      </Grid>

      {/* ── Charts Row ─────────────────────────────────────────── */}
      <Grid container spacing={2}>
        {/* Line Chart */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title="Evolução por Dia"
              subheader="Planejadas × Cumpridas × Visitas registradas"
              action={
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    pr: 1,
                    mt: 0.5,
                  }}
                >
                  {[
                    { color: BLUE, label: 'Planejadas' },
                    { color: ROSE, label: 'Cumpridas' },
                    { color: '#64748B', label: 'Visitas' },
                  ].map((item) => (
                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 8, height: 2, borderRadius: 1, background: item.color }} />
                      <Typography sx={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 600 }}>
                        {item.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              }
            />
            <CardContent sx={{ height: 320, pt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={computed.series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'DM Sans' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#475569', fontSize: 11, fontFamily: 'DM Sans' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReTooltip
                    contentStyle={{
                      background: '#162035',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      color: '#E2E8F0',
                      fontSize: 12,
                      fontFamily: 'DM Sans',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planejadas"
                    name="Planejadas"
                    stroke={BLUE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumpridas"
                    name="Cumpridas"
                    stroke={ROSE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="visitas"
                    name="Visitas"
                    stroke="#475569"
                    strokeWidth={1.5}
                    dot={false}
                    opacity={0.7}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Pie Chart */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title="Nível de Risco"
              subheader={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                  <PersonOutlineIcon sx={{ fontSize: 13, color: '#64748B' }} />
                  <span>{assistidas.length} assistidas ativas</span>
                </Box>
              }
              action={
                <Button
                  component={RouterLink}
                  to="/assistidas"
                  size="small"
                  sx={{ mt: 0.5, fontSize: '0.6875rem' }}
                  endIcon={<ArrowForwardIcon sx={{ fontSize: '12px !important' }} />}
                >
                  Ver todas
                </Button>
              }
            />
            <CardContent sx={{ height: 280, pt: 0 }}>
              {loading ? (
                <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                  <Chip label="Carregando…" sx={{ fontSize: '0.75rem' }} />
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <ReTooltip
                      contentStyle={{
                        background: '#162035',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        color: '#E2E8F0',
                        fontSize: 12,
                        fontFamily: 'DM Sans',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{ fontSize: '0.75rem', color: '#94A3B8', paddingTop: 8 }}
                    />
                    <Pie
                      data={computed.riscoChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="50%"
                      outerRadius="72%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
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
      </Grid>

      {/* ── Guarnições Performance ─────────────────────────────── */}
      <Card>
        <CardHeader title="Desempenho por Guarnição" subheader={`Taxa de cumprimento — ${range.label}`} />
        <CardContent>
          <Grid container spacing={2}>
            {computed.taxaPorGuarnicao.map((g) => {
              const pct = g.taxa;
              const color = pct >= 80 ? '#34D399' : pct >= 50 ? '#FBBF24' : '#F87171';
              return (
                <Grid item xs={12} sm={6} md={3} key={g.guarnicao}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.07)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                      {g.guarnicao}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 1 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {pct}%
                      </Typography>
                      <Typography sx={{ fontSize: '0.6875rem', color: '#475569' }}>
                        {g.cumpridas}/{g.planejadas}
                      </Typography>
                    </Box>
                    {/* Progress bar */}
                    <Box sx={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${Math.min(pct, 100)}%`,
                          borderRadius: 2,
                          background: `linear-gradient(90deg, ${color}, ${color}88)`,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>

      {/* ── Alerts Row ─────────────────────────────────────────── */}
      <Grid container spacing={2}>
        {/* Alert: Sem Visita */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningAmberIcon sx={{ fontSize: 16, color: '#FBBF24' }} />
                  <span>Sem Visita há +45 dias</span>
                </Box>
              }
              subheader="Assistidas que precisam de atenção imediata"
              action={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Box
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: '6px',
                      background: totalSemVisita > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${totalSemVisita > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      color: totalSemVisita > 0 ? '#FBBF24' : '#64748B',
                    }}
                  >
                    {totalSemVisita}
                  </Box>
                  {totalSemVisita > 8 && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setShowAllSemVisita((s) => !s)}
                      sx={{ fontSize: '0.6875rem', py: 0.5 }}
                    >
                      {showAllSemVisita ? 'Menos' : `+${totalSemVisita - 8}`}
                    </Button>
                  )}
                </Box>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              {totalSemVisita === 0 ? (
                <Box
                  sx={{
                    py: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <CheckCircleOutlineIcon sx={{ fontSize: 28, color: '#34D399', opacity: 0.7 }} />
                  <Typography variant="body2" color="text.secondary">
                    Nenhum alerta no momento
                  </Typography>
                </Box>
              ) : (
                <Stack divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                  {semVisitaToShow.map((a) => {
                    const riscoColor = a.risco === 'Alto' ? '#F87171' : a.risco === 'Médio' ? '#FBBF24' : a.risco === 'Baixo' ? '#34D399' : '#64748B';
                    return (
                      <AlertRow
                        key={a.id}
                        name={a.nome}
                        id={a.id.slice(0, 8)}
                        badge={a.risco === 'Sem' ? 'Sem classif.' : a.risco}
                        badgeColor={riscoColor}
                        rightPrimary={a.diasSemVisita >= 9990 ? 'Sem visitas' : `${a.diasSemVisita} dias`}
                        rightSecondary={a.ultimaVisitaMs ? new Date(a.ultimaVisitaMs).toLocaleDateString('pt-BR') : '—'}
                      />
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Alert: Medida Vencendo */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTimeIcon sx={{ fontSize: 16, color: '#F87171' }} />
                  <span>Medida Protetiva Vencendo</span>
                </Box>
              }
              subheader="Medidas com vencimento em até 7 dias"
              action={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Box
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: '6px',
                      background: totalVencendo > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${totalVencendo > 0 ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      color: totalVencendo > 0 ? '#F87171' : '#64748B',
                    }}
                  >
                    {totalVencendo}
                  </Box>
                  {totalVencendo > 8 && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setShowAllVencendo((s) => !s)}
                      sx={{ fontSize: '0.6875rem', py: 0.5 }}
                    >
                      {showAllVencendo ? 'Menos' : `+${totalVencendo - 8}`}
                    </Button>
                  )}
                </Box>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              {totalVencendo === 0 ? (
                <Box
                  sx={{
                    py: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <CheckCircleOutlineIcon sx={{ fontSize: 28, color: '#34D399', opacity: 0.7 }} />
                  <Typography variant="body2" color="text.secondary">
                    Nenhum alerta no momento
                  </Typography>
                </Box>
              ) : (
                <Stack divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                  {vencendoToShow.map((a) => {
                    const urgColor = a.diasParaVencer <= 2 ? '#F87171' : a.diasParaVencer <= 4 ? '#FBBF24' : '#94A3B8';
                    return (
                      <AlertRow
                        key={a.id}
                        name={a.nome}
                        detail={a.tipo !== '—' ? a.tipo : undefined}
                        badge={a.diasParaVencer === 0 ? 'Hoje' : a.diasParaVencer === 1 ? 'Amanhã' : undefined}
                        badgeColor="#F87171"
                        rightPrimary={`${a.diasParaVencer} dia${a.diasParaVencer !== 1 ? 's' : ''}`}
                        rightSecondary={new Date(a.validadeMs).toLocaleDateString('pt-BR')}
                      />
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
