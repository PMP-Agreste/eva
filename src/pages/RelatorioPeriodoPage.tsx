import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  TextField,
  Typography,
} from "@mui/material";
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import type { AgendaPlanejada, Visita } from "../types/models";

const GUARNICOES = ["PMP Alfa", "PMP Bravo", "PMP Charlie", "PMP Delta"] as const;
type Guarnicao = (typeof GUARNICOES)[number];

type AgendaRow = AgendaPlanejada & {
  idAssistida?: string;
  dataDia?: string; // "YYYY-MM-DD"
};

type VisitaRow = Visita & {
  id: string;
  dataHora?: unknown; // number | Timestamp
  guarnicao?: unknown;
  idAssistida?: unknown;
  houveDescumprimento?: unknown;
};

type Metric = {
  visitasTotal: number;
  assistidasUnicas: number;
  descumprimentos: number;
  agendaPlanejada: number;
  agendaRealizada: number;
  agendaNaoRealizada: number;
};

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeGuarnicaoKeyFromAny(v: unknown): Guarnicao | null {
  const raw = stripDiacritics(safeStr(v)).toLowerCase().trim().replace(/\s+/g, " ");
  if (!raw) return null;
  // aceita "pmp alfa", "alfa", "alpha", etc.
  const hasPmp = raw.includes("pmp") || raw.includes("patrulha") || raw.includes("maria");
  const s = raw.replace(/[^a-z0-9 ]/g, " ");
  if (s.includes("alfa") || s.includes("alpha")) return "PMP Alfa";
  if (s.includes("bravo")) return "PMP Bravo";
  if (s.includes("charlie") || s.includes("charly")) return "PMP Charlie";
  if (s.includes("delta")) return "PMP Delta";
  // fallback: se veio "PMP Alfa" bonitinho
  if (hasPmp) {
    if (s.includes("a")) return null;
  }
  // tenta match exato ignorando case/acentos
  const exact = GUARNICOES.find((g) => stripDiacritics(g).toLowerCase() === raw);
  return exact ?? null;
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function parseMillis(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "toMillis" in (v as any) && typeof (v as any).toMillis === "function") {
    const n = (v as any).toMillis();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return null;
}

function uniqById<T extends { id: string }>(items: T[]): T[] {
  const m = new Map<string, T>();
  for (const it of items) m.set(it.id, it);
  return Array.from(m.values());
}

async function fetchAgendasByDataDiaRange(startKey: string, endKey: string): Promise<AgendaRow[]> {
  const q = query(
    collection(db, "agendas_planejadas"),
    where("dataDia", ">=", startKey),
    where("dataDia", "<=", endKey),
    orderBy("dataDia", "asc"),
    limit(20000)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AgendaRow));
}

async function fetchVisitasBetween(startMs: number, endMs: number): Promise<VisitaRow[]> {
  const col = collection(db, "visitas");

  // number
  const qNum = query(
    col,
    where("dataHora", ">=", startMs),
    where("dataHora", "<=", endMs),
    orderBy("dataHora", "desc"),
    limit(25000)
  );

  // Timestamp
  const qTs = query(
    col,
    where("dataHora", ">=", Timestamp.fromMillis(startMs)),
    where("dataHora", "<=", Timestamp.fromMillis(endMs)),
    orderBy("dataHora", "desc"),
    limit(25000)
  );

  const results = await Promise.allSettled([getDocs(qNum), getDocs(qTs)]);
  const all: VisitaRow[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    all.push(...r.value.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as VisitaRow)));
  }

  return uniqById(all);
}

function KPICard(props: { title: string; value: ReactNode; helper?: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader
        titleTypographyProps={{ variant: "body2", color: "text.secondary" }}
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

function emptyMetric(): Metric {
  return {
    visitasTotal: 0,
    assistidasUnicas: 0,
    descumprimentos: 0,
    agendaPlanejada: 0,
    agendaRealizada: 0,
    agendaNaoRealizada: 0,
  };
}

function addMetric(a: Metric, b: Metric): Metric {
  return {
    visitasTotal: a.visitasTotal + b.visitasTotal,
    assistidasUnicas: a.assistidasUnicas + b.assistidasUnicas,
    descumprimentos: a.descumprimentos + b.descumprimentos,
    agendaPlanejada: a.agendaPlanejada + b.agendaPlanejada,
    agendaRealizada: a.agendaRealizada + b.agendaRealizada,
    agendaNaoRealizada: a.agendaNaoRealizada + b.agendaNaoRealizada,
  };
}

export function RelatorioPeriodoPage() {
  // default: últimos 7 dias
  const [startStr, setStartStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return ymd(d);
  });
  const [endStr, setEndStr] = useState(() => ymd(new Date()));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agendas, setAgendas] = useState<AgendaRow[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);

  const startDate = useMemo(() => new Date(`${startStr}T00:00:00`), [startStr]);
  const endDate = useMemo(() => new Date(`${endStr}T00:00:00`), [endStr]);

  const startMs = useMemo(() => startOfDayMs(startDate), [startDate]);
  const endMs = useMemo(() => endOfDayMs(endDate), [endDate]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      // agendas por dataDia (string)
      const a = await fetchAgendasByDataDiaRange(startStr, endStr);
      // visitas por dataHora (number ou Timestamp)
      const v = await fetchVisitasBetween(startMs, endMs);

      setAgendas(a);
      setVisitas(v);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados do relatório.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // auto-load ao alterar datas (com leve proteção)
    if (!startStr || !endStr) return;
    if (startStr > endStr) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr]);

  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date(`${startStr}T00:00:00`);
    const end = new Date(`${endStr}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (d.getTime() <= end.getTime()) {
      out.push(ymd(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [startStr, endStr]);

  // index agendas por dia e guarnição
  const agendasByDayGu = useMemo(() => {
    const m = new Map<string, Map<Guarnicao, AgendaRow[]>>();
    for (const row of agendas) {
      const day = safeStr((row as any).dataDia || "");
      if (!day) continue;
      // tente guarnição em vários campos comuns
      const g =
        normalizeGuarnicaoKeyFromAny((row as any).guarnicao) ||
        normalizeGuarnicaoKeyFromAny((row as any).guarnicaoKey) ||
        normalizeGuarnicaoKeyFromAny((row as any).equipe) ||
        null;
      if (!g) continue;

      if (!m.has(day)) m.set(day, new Map());
      const inner = m.get(day)!;
      if (!inner.has(g)) inner.set(g, []);
      inner.get(g)!.push(row);
    }
    return m;
  }, [agendas]);

  // index visitas por dia e guarnição
  const visitasByDayGu = useMemo(() => {
    const m = new Map<string, Map<Guarnicao, VisitaRow[]>>();
    for (const v of visitas) {
      const ms = parseMillis((v as any).dataHora);
      if (!ms) continue;
      const d = new Date(ms);
      const day = ymd(d);

      const g =
        normalizeGuarnicaoKeyFromAny((v as any).guarnicao) ||
        normalizeGuarnicaoKeyFromAny((v as any).guarnicaoKey) ||
        normalizeGuarnicaoKeyFromAny((v as any).equipe) ||
        null;
      if (!g) continue;

      if (!m.has(day)) m.set(day, new Map());
      const inner = m.get(day)!;
      if (!inner.has(g)) inner.set(g, []);
      inner.get(g)!.push(v);
    }
    return m;
  }, [visitas]);

  // métricas por dia+gu
  const metricsByDayGu = useMemo(() => {
    const m = new Map<string, Map<Guarnicao, Metric>>();
    for (const day of days) {
      const inner = new Map<Guarnicao, Metric>();
      for (const g of GUARNICOES) {
        const vlist = visitasByDayGu.get(day)?.get(g) ?? [];
        const alist = agendasByDayGu.get(day)?.get(g) ?? [];

        const assistidasSet = new Set<string>();
        let desc = 0;

        for (const v of vlist) {
          const idA = safeStr((v as any).idAssistida);
          if (idA) assistidasSet.add(idA);
          if ((v as any).houveDescumprimento === true) desc += 1;
        }

        // agenda realizada: idAssistida da agenda aparece nas visitas do mesmo dia/guarnição
        const visitasAssistidas = new Set<string>();
        for (const v of vlist) {
          const idA = safeStr((v as any).idAssistida);
          if (idA) visitasAssistidas.add(idA);
        }

        let realizada = 0;
        for (const a of alist) {
          const idA = safeStr((a as any).idAssistida);
          if (idA && visitasAssistidas.has(idA)) realizada += 1;
        }

        const planejada = alist.length;
        const naoRealizada = Math.max(0, planejada - realizada);

        inner.set(g, {
          visitasTotal: vlist.length,
          assistidasUnicas: assistidasSet.size,
          descumprimentos: desc,
          agendaPlanejada: planejada,
          agendaRealizada: realizada,
          agendaNaoRealizada: naoRealizada,
        });
      }
      m.set(day, inner);
    }
    return m;
  }, [days, visitasByDayGu, agendasByDayGu]);

  // totais do período por guarnição e geral
  const totalByGu = useMemo(() => {
    const out = new Map<Guarnicao, Metric>();
    for (const g of GUARNICOES) out.set(g, emptyMetric());

    for (const day of days) {
      const inner = metricsByDayGu.get(day);
      if (!inner) continue;
      for (const g of GUARNICOES) {
        out.set(g, addMetric(out.get(g)!, inner.get(g) ?? emptyMetric()));
      }
    }
    return out;
  }, [days, metricsByDayGu]);

  const totalPeriodo = useMemo(() => {
    let acc = emptyMetric();
    for (const g of GUARNICOES) {
      acc = addMetric(acc, totalByGu.get(g) ?? emptyMetric());
    }
    return acc;
  }, [totalByGu]);

  const canLoad = startStr && endStr && startStr <= endStr;

  function buildResumoTexto(): string {
    const lines: string[] = [];
    lines.push("RELATÓRIO (PERÍODO) - PATRULHA MARIA DA PENHA");
    lines.push(`Período: ${startStr} a ${endStr}`);
    lines.push("");

    lines.push("RESUMO GERAL DO PERÍODO:");
    lines.push(`- Visitas: ${totalPeriodo.visitasTotal}`);
    lines.push(`- Assistidas únicas (somatório por dia/guarnição): ${totalPeriodo.assistidasUnicas}`);
    lines.push(`- Descumprimentos: ${totalPeriodo.descumprimentos}`);
    lines.push(`- Agenda planejada: ${totalPeriodo.agendaPlanejada}`);
    lines.push(`- Agenda realizada: ${totalPeriodo.agendaRealizada}`);
    lines.push(`- Agenda não realizada: ${totalPeriodo.agendaNaoRealizada}`);
    lines.push("");

    for (const day of days) {
      lines.push(`DIA ${day}`);
      const inner = metricsByDayGu.get(day);
      for (const g of GUARNICOES) {
        const m = inner?.get(g) ?? emptyMetric();
        const temAlgo = m.visitasTotal > 0 || m.agendaPlanejada > 0 || m.descumprimentos > 0;
        if (!temAlgo) {
          lines.push(`• ${g}: SEM REGISTROS (visitas/agenda)`);
          continue;
        }
        lines.push(`• ${g}:`);
        lines.push(`  - Visitas: ${m.visitasTotal} | Assistidas únicas: ${m.assistidasUnicas} | Desc.: ${m.descumprimentos}`);
        lines.push(
          `  - Agenda: planejada ${m.agendaPlanejada} | realizada ${m.agendaRealizada} | não realizada ${m.agendaNaoRealizada}`
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  async function copyResumo() {
    const txt = buildResumoTexto();
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // fallback antigo
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              Relatório por Período
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Mesmo cálculo do app: visitas + agenda planejada (por dia e por guarnição).
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 6);
                setStartStr(ymd(d));
                setEndStr(ymd(new Date()));
              }}
            >
              Últimos 7 dias
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 29);
                setStartStr(ymd(d));
                setEndStr(ymd(new Date()));
              }}
            >
              Últimos 30 dias
            </Button>
          </Stack>
        </Stack>

        <Card>
          <CardHeader title="Filtro do período" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Data inicial"
                  type="date"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Data final"
                  type="date"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Stack direction="row" spacing={1} sx={{ height: "100%" }} alignItems="center">
                  <Button variant="contained" disabled={!canLoad || busy} onClick={load}>
                    {busy ? "Carregando..." : "Atualizar"}
                  </Button>
                  <Button variant="outlined" disabled={!canLoad || busy} onClick={copyResumo}>
                    Copiar resumo
                  </Button>
                </Stack>
              </Grid>
            </Grid>

            {!canLoad ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Informe um período válido (data inicial não pode ser maior que a final).
              </Alert>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Visitas (período)" value={totalPeriodo.visitasTotal} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Assistidas únicas (somatório)" value={totalPeriodo.assistidasUnicas} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Descumprimentos" value={totalPeriodo.descumprimentos} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Agenda planejada" value={totalPeriodo.agendaPlanejada} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Agenda realizada" value={totalPeriodo.agendaRealizada} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <KPICard title="Agenda não realizada" value={totalPeriodo.agendaNaoRealizada} />
          </Grid>
        </Grid>

        <Card>
          <CardHeader title="Resumo por guarnição (no período)" />
          <CardContent>
            <Grid container spacing={2}>
              {GUARNICOES.map((g) => {
                const m = totalByGu.get(g) ?? emptyMetric();
                return (
                  <Grid item xs={12} md={6} key={g}>
                    <Card variant="outlined">
                      <CardHeader
                        title={g}
                        action={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" label={`Visitas: ${m.visitasTotal}`} />
                            <Chip size="small" label={`Agenda: ${m.agendaPlanejada}`} />
                          </Stack>
                        }
                      />
                      <CardContent sx={{ pt: 0 }}>
                        <Grid container spacing={1.5}>
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">
                              Assistidas únicas
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{m.assistidasUnicas}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">
                              Descumprimentos
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{m.descumprimentos}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">
                              Agenda realizada
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{m.agendaRealizada}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">
                              Agenda não realizada
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{m.agendaNaoRealizada}</Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Detalhamento por dia e guarnição"
            subheader="Tabela com as métricas calculadas (visitas + agenda)."
          />
          <CardContent>
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                <Box component="thead">
                  <Box component="tr">
                    <Box component="th" sx={{ textAlign: "left", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Dia
                    </Box>
                    <Box component="th" sx={{ textAlign: "left", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Guarnição
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Visitas
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Assistidas únicas
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Desc.
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Agenda (plan)
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Agenda (real)
                    </Box>
                    <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                      Agenda (não real)
                    </Box>
                  <Box component="tr">
                </Box>
                <Box component="tbody">
                  {days.map((day) =>
                    GUARNICOES.map((g, idx) => {
                      const m = metricsByDayGu.get(day)?.get(g) ?? emptyMetric();
                      const muted = m.visitasTotal === 0 && m.agendaPlanejada === 0 && m.descumprimentos === 0;
                      return (
                        <Box component="tr" key={`${day}-${g}`} sx={{ opacity: muted ? 0.55 : 1 }}>
                          <Box component="td" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                            {idx === 0 ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography sx={{ fontWeight: 900 }}>{day}</Typography>
                              </Stack>
                            ) : (
                              <Typography color="text.secondary">{day}</Typography>
                            )}
                          </Box>
                          <Box component="td" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                            {g}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.visitasTotal}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.assistidasUnicas}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.descumprimentos}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.agendaPlanejada}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.agendaRealizada}
                          </Box>
                          <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                            {m.agendaNaoRealizada}
                          </Box>
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Alert severity="info">
              Se você quiser que esta tela exiba também as informações “manuais” do relatório (comandante, viatura, ações, eventos),
              aí precisamos consultar a coleção onde você salva o <b>RelatorioServicoDia</b> no Firestore (o app grava um doc por
              dia+guarnição).
            </Alert>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
