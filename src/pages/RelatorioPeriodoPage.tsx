import { useEffect, useMemo, useState } from "react";
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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

type Acao = {
  tipo?: string | null;
  quantidade?: number | null;
  detalhe?: string | null;
};

type ResumoAuto = {
  agendaNaoRealizada?: number;
  agendaPlanejada?: number;
  agendaRealizada?: number;
  assistidasUnicas?: number;
  descumprimentos?: number;
  visitasTotal?: number;
};

type RelatorioServico = {
  id: string;

  // datas / chaves
  dataDia?: string; // "YYYY-MM-DD"
  dataServico?: number; // epoch ms
  guarnicao?: string;
  guarnicaoKey?: string; // "PMP_BRAVO"

  // identificação
  comandanteGuarnicao?: string;
  efetivo?: string;
  prefixoViatura?: string;
  placaViatura?: string;
  kmInicial?: number | null;
  kmFinal?: number | null;

  // texto livre
  observacoesGerais?: string | null;
  pendenciasProximoServico?: string | null;
  problemasOperacionais?: string | null;

  // arrays / maps
  acoes?: Acao[];
  eventos?: any[];

  // resumo
  resumoAuto?: ResumoAuto;
  resumoConfere?: boolean;
  justificativaDivergencia?: string | null;

  // meta
  criadoEm?: number;
  atualizadoEm?: number;
};

const GUARNICOES_KEYS = ["PMP_ALFA", "PMP_BRAVO", "PMP_CHARLIE", "PMP_DELTA"] as const;

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function fmtGuKey(k: string) {
  return k.replaceAll("_", " ").trim();
}

function sumResumo(rows: RelatorioServico[]) {
  const out = {
    visitasTotal: 0,
    assistidasUnicas: 0,
    descumprimentos: 0,
    agendaPlanejada: 0,
    agendaRealizada: 0,
    agendaNaoRealizada: 0,
  };

  for (const r of rows) {
    const s = r.resumoAuto ?? {};
    out.visitasTotal += safeNum(s.visitasTotal);
    out.assistidasUnicas += safeNum(s.assistidasUnicas);
    out.descumprimentos += safeNum(s.descumprimentos);
    out.agendaPlanejada += safeNum(s.agendaPlanejada);
    out.agendaRealizada += safeNum(s.agendaRealizada);
    out.agendaNaoRealizada += safeNum(s.agendaNaoRealizada);
  }

  return out;
}

function aggregateAcoes(rows: RelatorioServico[]) {
  const map = new Map<string, { tipo: string; quantidade: number; exemplosDetalhe: string[] }>();

  for (const r of rows) {
    for (const a of r.acoes ?? []) {
      const tipo = safeStr(a?.tipo).trim();
      if (!tipo) continue;

      const qtd = safeNum(a?.quantidade);
      const det = safeStr(a?.detalhe).trim();

      if (!map.has(tipo)) map.set(tipo, { tipo, quantidade: 0, exemplosDetalhe: [] });
      const item = map.get(tipo)!;
      item.quantidade += qtd;

      if (det) {
        // guarda só alguns exemplos para não poluir
        if (item.exemplosDetalhe.length < 6 && !item.exemplosDetalhe.includes(det)) {
          item.exemplosDetalhe.push(det);
        }
      }
    }
  }

  // ordena por quantidade desc
  return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
}

async function fetchRelatoriosByPeriodo(startYmd: string, endYmd: string): Promise<RelatorioServico[]> {
  const q = query(
    collection(db, "relatorios_servico"),
    where("dataDia", ">=", startYmd),
    where("dataDia", "<=", endYmd),
    orderBy("dataDia", "asc"),
    limit(5000)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RelatorioServico[];
}

export default function RelatorioPeriodoPage() {
  // defaults: últimos 7 dias
  const [startStr, setStartStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return ymd(d);
  });
  const [endStr, setEndStr] = useState(() => ymd(new Date()));
  const [guKey, setGuKey] = useState<string>("TODAS");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<RelatorioServico[]>([]);

  const canLoad = Boolean(startStr && endStr && startStr <= endStr);

  async function load() {
    if (!canLoad) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchRelatoriosByPeriodo(startStr, endStr);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar relatórios.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canLoad) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr]);

  const filtered = useMemo(() => {
    const base = rows;
    if (guKey === "TODAS") return base;
    return base.filter((r) => safeStr(r.guarnicaoKey) === guKey);
  }, [rows, guKey]);

  const totals = useMemo(() => sumResumo(filtered), [filtered]);

  const countTotal = filtered.length;
  const countNaoConfere = filtered.filter((r) => r.resumoConfere === false).length;

  const acoesAgg = useMemo(() => aggregateAcoes(filtered), [filtered]);

  const groupedByDia = useMemo(() => {
    const m = new Map<string, RelatorioServico[]>();
    for (const r of filtered) {
      const day = safeStr(r.dataDia);
      if (!day) continue;
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function buildResumoTexto(): string {
    const lines: string[] = [];
    lines.push("RELATÓRIO DE SERVIÇO - PERÍODO (WEB)");
    lines.push(`Período: ${startStr} a ${endStr}`);
    if (guKey !== "TODAS") lines.push(`Guarnição: ${fmtGuKey(guKey)}`);
    lines.push("");

    lines.push("TOTAIS DO PERÍODO (somatório dos resumosAuto):");
    lines.push(`- Relatórios encontrados: ${countTotal}`);
    lines.push(`- Resumo NÃO confere: ${countNaoConfere}`);
    lines.push(`- Visitas total: ${totals.visitasTotal}`);
    lines.push(`- Assistidas únicas (somatório): ${totals.assistidasUnicas}`);
    lines.push(`- Descumprimentos: ${totals.descumprimentos}`);
    lines.push(`- Agenda planejada: ${totals.agendaPlanejada}`);
    lines.push(`- Agenda realizada: ${totals.agendaRealizada}`);
    lines.push(`- Agenda não realizada: ${totals.agendaNaoRealizada}`);
    lines.push("");

    if (acoesAgg.length) {
      lines.push("AÇÕES (somatório por tipo):");
      for (const a of acoesAgg) {
        lines.push(`- ${a.tipo}: ${a.quantidade}`);
        if (a.exemplosDetalhe.length) {
          lines.push(`  Ex.: ${a.exemplosDetalhe.join(" | ")}`);
        }
      }
      lines.push("");
    }

    for (const [day, items] of groupedByDia) {
      lines.push(`DIA ${day}`);
      for (const r of items) {
        const g = safeStr(r.guarnicaoKey) || safeStr(r.guarnicao) || "SEM GUARNIÇÃO";
        const cmd = safeStr(r.comandanteGuarnicao);
        const vtr = `${safeStr(r.prefixoViatura)} ${safeStr(r.placaViatura)}`.trim();
        const s = r.resumoAuto ?? {};
        lines.push(`• ${g}${cmd ? ` | CMT: ${cmd}` : ""}${vtr ? ` | VTR: ${vtr}` : ""}`);
        lines.push(
          `  - Visitas: ${safeNum(s.visitasTotal)} | Assistidas únicas: ${safeNum(
            s.assistidasUnicas
          )} | Desc.: ${safeNum(s.descumprimentos)}`
        );
        lines.push(
          `  - Agenda: plan ${safeNum(s.agendaPlanejada)} | real ${safeNum(s.agendaRealizada)} | não real ${safeNum(
            s.agendaNaoRealizada
          )}`
        );
        if (r.resumoConfere === false) {
          const j = safeStr(r.justificativaDivergencia).trim();
          lines.push(`  - RESUMO NÃO CONFERE${j ? ` | Just.: ${j}` : ""}`);
        }
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
            <Stack direction="row" spacing={1} alignItems="center">
              <AssessmentOutlinedIcon />
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                Relatório por Período (Firestore)
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Fonte: coleção <b>relatorios_servico</b> (campos: dataDia, guarnicaoKey, resumoAuto, acoes, etc.).
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
          <CardHeader title="Filtros" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  label="Data inicial"
                  type="date"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  label="Data final"
                  type="date"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField fullWidth select label="Guarnição" value={guKey} onChange={(e) => setGuKey(e.target.value)}>
                  <MenuItem value="TODAS">Todas</MenuItem>
                  {GUARNICOES_KEYS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {fmtGuKey(k)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={3}>
                <Stack direction="row" spacing={1} sx={{ height: "100%" }} alignItems="center">
                  <Button variant="contained" startIcon={<RefreshIcon />} disabled={!canLoad || busy} onClick={load}>
                    {busy ? "Carregando..." : "Atualizar"}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    disabled={!canLoad || busy}
                    onClick={copyResumo}
                  >
                    Copiar
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
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Relatórios" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {countTotal}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Não confere" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {countNaoConfere}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Visitas" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.visitasTotal}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader
                titleTypographyProps={{ variant: "body2", color: "text.secondary" }}
                title="Assistidas únicas"
                sx={{ pb: 0.5 }}
              />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.assistidasUnicas}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Descumprimentos" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.descumprimentos}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Agenda (plan)" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.agendaPlanejada}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Agenda (real)" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.agendaRealizada}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={4} md={2}>
            <Card>
              <CardHeader titleTypographyProps={{ variant: "body2", color: "text.secondary" }} title="Agenda (não real)" sx={{ pb: 0.5 }} />
              <CardContent sx={{ pt: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {totals.agendaNaoRealizada}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card>
          <CardHeader
            title="Ações no período (somatório)"
            subheader="Baseado no array 'acoes' de cada relatório."
          />
          <CardContent>
            {acoesAgg.length === 0 ? (
              <Alert severity="info">Nenhuma ação encontrada no período/guarnição selecionados.</Alert>
            ) : (
              <Grid container spacing={1.5}>
                {acoesAgg.map((a) => (
                  <Grid item xs={12} md={6} key={a.tipo}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Typography sx={{ fontWeight: 900 }}>{a.tipo}</Typography>
                          <Chip label={`Qtd: ${a.quantidade}`} />
                        </Stack>
                        {a.exemplosDetalhe.length ? (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Exemplos: {a.exemplosDetalhe.join(" | ")}
                          </Typography>
                        ) : null}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Relatórios encontrados"
            subheader="Detalhe por documento (campos do Firestore)."
          />
          <CardContent>
            {filtered.length === 0 ? (
              <Alert severity="warning">Nenhum relatório encontrado no período selecionado.</Alert>
            ) : (
              <Stack spacing={1.5}>
                {filtered.map((r) => {
                  const s = r.resumoAuto ?? {};
                  const gKey = safeStr(r.guarnicaoKey) || "SEM_KEY";
                  const g = safeStr(r.guarnicao) || fmtGuKey(gKey);
                  const titulo = `${safeStr(r.dataDia)} | ${gKey}`;

                  const vtr = `${safeStr(r.prefixoViatura)} ${safeStr(r.placaViatura)}`.trim();

                  return (
                    <Card key={r.id} variant="outlined">
                      <CardHeader
                        title={titulo}
                        subheader={
                          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">
                              Guarnição: <b>{g}</b>
                            </Typography>
                            {r.comandanteGuarnicao ? (
                              <Typography variant="body2" color="text.secondary">
                                CMT: <b>{r.comandanteGuarnicao}</b>
                              </Typography>
                            ) : null}
                            {vtr ? (
                              <Typography variant="body2" color="text.secondary">
                                VTR: <b>{vtr}</b>
                              </Typography>
                            ) : null}
                          </Stack>
                        }
                        action={
                          <Stack direction="row" spacing={1}>
                            <Chip size="small" label={`Visitas: ${safeNum(s.visitasTotal)}`} />
                            <Chip size="small" label={`Desc.: ${safeNum(s.descumprimentos)}`} />
                            <Chip
                              size="small"
                              color={r.resumoConfere === false ? "warning" : "default"}
                              label={r.resumoConfere === false ? "Não confere" : "Confere"}
                            />
                          </Stack>
                        }
                      />
                      <CardContent sx={{ pt: 0 }}>
                        <Grid container spacing={1.5}>
                          <Grid item xs={6} md={2}>
                            <Typography variant="caption" color="text.secondary">
                              Assistidas únicas
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{safeNum(s.assistidasUnicas)}</Typography>
                          </Grid>

                          <Grid item xs={6} md={2}>
                            <Typography variant="caption" color="text.secondary">
                              Agenda planejada
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{safeNum(s.agendaPlanejada)}</Typography>
                          </Grid>

                          <Grid item xs={6} md={2}>
                            <Typography variant="caption" color="text.secondary">
                              Agenda realizada
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{safeNum(s.agendaRealizada)}</Typography>
                          </Grid>

                          <Grid item xs={6} md={2}>
                            <Typography variant="caption" color="text.secondary">
                              Agenda não realizada
                            </Typography>
                            <Typography sx={{ fontWeight: 900 }}>{safeNum(s.agendaNaoRealizada)}</Typography>
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Efetivo
                            </Typography>
                            <Typography sx={{ fontWeight: 700 }} noWrap title={safeStr(r.efetivo)}>
                              {safeStr(r.efetivo) || "-"}
                            </Typography>
                          </Grid>
                        </Grid>

                        {r.resumoConfere === false ? (
                          <Alert severity="warning" sx={{ mt: 2 }}>
                            <b>Justificativa:</b> {safeStr(r.justificativaDivergencia) || "—"}
                          </Alert>
                        ) : null}

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>
                          Ações registradas
                        </Typography>

                        {(r.acoes?.length ?? 0) === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Nenhuma ação registrada.
                          </Typography>
                        ) : (
                          <Box sx={{ overflowX: "auto" }}>
                            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                              <Box component="thead">
                                <Box component="tr">
                                  <Box component="th" sx={{ textAlign: "left", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                                    Tipo
                                  </Box>
                                  <Box component="th" sx={{ textAlign: "right", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                                    Qtd
                                  </Box>
                                  <Box component="th" sx={{ textAlign: "left", p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                                    Detalhe
                                  </Box>
                                </Box>
                              </Box>
                              <Box component="tbody">
                                {(r.acoes ?? []).map((a, idx) => (
                                  <Box component="tr" key={`${r.id}-acao-${idx}`}>
                                    <Box component="td" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                                      {safeStr(a.tipo) || "-"}
                                    </Box>
                                    <Box component="td" sx={{ p: 1, textAlign: "right", borderBottom: "1px solid", borderColor: "divider" }}>
                                      {safeNum(a.quantidade)}
                                    </Box>
                                    <Box component="td" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                                      {safeStr(a.detalhe) || "-"}
                                    </Box>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          </Box>
                        )}

                        {(r.observacoesGerais || r.pendenciasProximoServico || r.problemasOperacionais) ? (
                          <>
                            <Divider sx={{ my: 2 }} />
                            <Grid container spacing={1.5}>
                              <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">
                                  Observações gerais
                                </Typography>
                                <Typography>{safeStr(r.observacoesGerais) || "—"}</Typography>
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">
                                  Pendências próximo serviço
                                </Typography>
                                <Typography>{safeStr(r.pendenciasProximoServico) || "—"}</Typography>
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">
                                  Problemas operacionais
                                </Typography>
                                <Typography>{safeStr(r.problemasOperacionais) || "—"}</Typography>
                              </Grid>
                            </Grid>
                          </>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
