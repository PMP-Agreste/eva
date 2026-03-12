import { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  CollectionReference,
  DocumentData,
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import type { AgendaPlanejada, Assistida, Visita } from "../types/models";

type GuarnicaoKey = "Todos" | "PMP Alfa" | "PMP Bravo" | "PMP Charlie" | "PMP Delta";
const GUARNICOES: GuarnicaoKey[] = ["Todos", "PMP Alfa", "PMP Bravo", "PMP Charlie", "PMP Delta"];
const GUARNICOES_ONLY: Exclude<GuarnicaoKey, "Todos">[] = ["PMP Alfa", "PMP Bravo", "PMP Charlie", "PMP Delta"];

type TipoVisita = "Rondas" | "Contato Telefônico" | "Visita Presencial";
const TIPOS_VISITA: TipoVisita[] = ["Rondas", "Contato Telefônico", "Visita Presencial"];

const PAGE_ASSISTIDAS_LIMIT = 500;

type AgendaItem = AgendaPlanejada & {
  dataDia?: string; // "YYYY-MM-DD"
  idAssistida?: string;
  observacoes?: string | null;
  ordem?: number;
  guarnicao?: string;
  chaveDiaGuarnicao?: string;
  tipoVisita?: TipoVisita | string | null; // ✅ novo
};

type VisitaItem = Visita & {
  dataHora?: unknown; // number(ms) ou Timestamp-like
  idAssistida?: string;
  guarnicao?: string;
};

function two(n: number) {
  return String(n).padStart(2, "0");
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
function norm(v: any) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function assistidaLabel(a: Assistida | null) {
  if (!a) return "";
  const nome = String((a as any)?.nomeCompleto ?? "").trim();
  const proc = String((a as any)?.numeroProcesso ?? "").trim();
  if (nome && proc) return `${nome} • ${proc}`;
  return nome || proc || a.id;
}

async function fetchAssistidasList(): Promise<Assistida[]> {
  const assistidasCol = collection(db, "assistidas") as CollectionReference<DocumentData>;
  const q = query(assistidasCol, orderBy("nomeCompleto", "asc"), limit(PAGE_ASSISTIDAS_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Assistida[];
}

async function fetchAssistidasByIds(ids: string[]): Promise<Record<string, Assistida>> {
  const out: Record<string, Assistida> = {};
  const assistidasCol = collection(db, "assistidas") as CollectionReference<DocumentData>;
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const q = query(assistidasCol, where(documentId(), "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      out[d.id] = { id: d.id, ...(d.data() as any) } as Assistida;
    });
  }
  return out;
}

export function AgendaPlanejadaPage() {
  const [dataStr, setDataStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  });

  const [guarnicao, setGuarnicao] = useState<GuarnicaoKey>("Todos");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agendas, setAgendas] = useState<AgendaItem[]>([]);
  const [visitasDia, setVisitasDia] = useState<VisitaItem[]>([]);
  const [assistidasMap, setAssistidasMap] = useState<Record<string, Assistida>>({});

  const [reloadKey, setReloadKey] = useState(0);

  // ===== Planejar pelo site =====
  const [plannerOpen, setPlannerOpen] = useState(false);

  const [assistidasOpts, setAssistidasOpts] = useState<Assistida[]>([]);
  const [assistidasBusy, setAssistidasBusy] = useState(false);
  const [assistidasErr, setAssistidasErr] = useState<string | null>(null);

  const [planGuarnicao, setPlanGuarnicao] = useState<Exclude<GuarnicaoKey, "Todos">>("PMP Alfa");
  const [planAssistida, setPlanAssistida] = useState<Assistida | null>(null);
  const [planTipo, setPlanTipo] = useState<TipoVisita>("Rondas"); // ✅ novo
  const [planObs, setPlanObs] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (guarnicao !== "Todos") setPlanGuarnicao(guarnicao);
  }, [guarnicao]);

  const dayRange = useMemo(() => {
    const base = new Date(`${dataStr}T00:00:00`);
    const from = startOfDay(Number.isNaN(base.getTime()) ? new Date() : base);
    const to = addDays(from, 1);
    return { from, to };
  }, [dataStr]);

  async function loadAssistidas(force = false) {
    if (assistidasBusy) return;
    if (!force && assistidasOpts.length > 0) return;

    setAssistidasBusy(true);
    setAssistidasErr(null);

    try {
      const list = await fetchAssistidasList();
      setAssistidasOpts(list);
    } catch (e: any) {
      setAssistidasErr(e?.message ?? "Falha ao carregar assistidas.");
    } finally {
      setAssistidasBusy(false);
    }
  }

  useEffect(() => {
    if (!plannerOpen) return;
    loadAssistidas(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerOpen]);

  useEffect(() => {
    let alive = true;

    async function loadPageData() {
      setLoading(true);
      setError(null);

      try {
        // 1) agendas planejadas do dia
        const agendasCol = collection(db, "agendas_planejadas");
        let agendaDocs: AgendaItem[] = [];

        if (guarnicao === "Todos") {
          const qAg = query(agendasCol, where("dataDia", "==", dataStr));
          const snap = await getDocs(qAg);
          agendaDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];
        } else {
          const chave = `${dataStr}|${guarnicao}`;
          const qAg = query(agendasCol, where("chaveDiaGuarnicao", "==", chave));
          const snap = await getDocs(qAg);
          agendaDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];

          if (agendaDocs.length === 0) {
            const qAg2 = query(agendasCol, where("dataDia", "==", dataStr));
            const snap2 = await getDocs(qAg2);
            const all = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AgendaItem[];
            agendaDocs = all.filter((a) => String(a.guarnicao ?? "").trim() === guarnicao);
          }
        }

        agendaDocs.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));

        // 2) visitas do dia
        const fromMs = dayRange.from.getTime();
        const toMs = dayRange.to.getTime();

        const visitasCol = collection(db, "visitas");
        const qVis = query(visitasCol, where("dataHora", ">=", fromMs), where("dataHora", "<", toMs));
        const visSnap = await getDocs(qVis);
        const visDocs = visSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VisitaItem[];

        // 3) assistidas referenciadas (ids)
        const idsAssistidas = Array.from(
          new Set(agendaDocs.map((a) => String(a.idAssistida ?? "").trim()).filter(Boolean))
        );

        let asMap: Record<string, Assistida> = {};
        if (idsAssistidas.length) {
          try {
            asMap = await fetchAssistidasByIds(idsAssistidas);
          } catch {
            asMap = {};
          }
        }

        if (!alive) return;
        setAgendas(agendaDocs);
        setVisitasDia(visDocs);
        setAssistidasMap(asMap);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Falha ao carregar agenda/visitas.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadPageData();
    return () => {
      alive = false;
    };
  }, [dataStr, guarnicao, dayRange.from, dayRange.to, reloadKey]);

  const computed = useMemo(() => {
    const anyVisit = new Set<string>();
    const byGuarnicao = new Map<string, Set<string>>();

    for (const v of visitasDia) {
      const aid = String(v.idAssistida ?? "").trim();
      if (!aid) continue;
      anyVisit.add(aid);

      const g = String(v.guarnicao ?? "").trim();
      if (g) {
        if (!byGuarnicao.has(g)) byGuarnicao.set(g, new Set());
        byGuarnicao.get(g)!.add(aid);
      }
    }
    return { anyVisit, byGuarnicao };
  }, [visitasDia]);

  const rows = useMemo(() => {
    const s = norm(search);

    return agendas
      .map((a, idx) => {
        const idAssistida = String(a.idAssistida ?? "").trim();
        const g = String(a.guarnicao ?? "").trim();

        const doneAny = !!idAssistida && computed.anyVisit.has(idAssistida);
        const doneSame = !!idAssistida && !!g && (computed.byGuarnicao.get(g)?.has(idAssistida) ?? false);

        const asst = idAssistida ? assistidasMap[idAssistida] : undefined;
        const nome = String((asst as any)?.nomeCompleto ?? "").trim();
        const processo = String((asst as any)?.numeroProcesso ?? "").trim();
        const risco = String((asst as any)?.grauRisco ?? "").trim();
        const tipoVisita = String((a as any)?.tipoVisita ?? "").trim() || "—";

        if (s) {
          const blob = [a.id, idAssistida, g, nome, processo, risco, a.observacoes, tipoVisita]
            .map((x) => norm(x))
            .join(" | ");
          if (!blob.includes(s)) return null;
        }

        if (onlyPending && doneAny) return null;

        return {
          idx: idx + 1,
          agenda: a,
          idAssistida,
          guarnicao: g || "—",
          nome: nome || "—",
          processo: processo || "—",
          risco: risco || "—",
          tipoVisita,
          doneAny,
          doneSame,
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
      tipoVisita: string;
      doneAny: boolean;
      doneSame: boolean;
    }>;
  }, [agendas, assistidasMap, computed.anyVisit, computed.byGuarnicao, search, onlyPending]);

  const summary = useMemo(() => {
    const total = agendas.length;
    let doneAny = 0;
    let doneSame = 0;

    for (const a of agendas) {
      const idAssistida = String(a.idAssistida ?? "").trim();
      const g = String(a.guarnicao ?? "").trim();
      if (idAssistida && computed.anyVisit.has(idAssistida)) doneAny += 1;
      if (idAssistida && g && (computed.byGuarnicao.get(g)?.has(idAssistida) ?? false)) doneSame += 1;
    }

    return { total, doneAny, doneSame, pend: total - doneAny };
  }, [agendas, computed.anyVisit, computed.byGuarnicao]);

  async function addPlanned() {
    setError(null);
    setPlanMsg(null);

    const dateOk = !!dataStr && /^\d{4}-\d{2}-\d{2}$/.test(dataStr);
    if (!dateOk) {
      setError("Data inválida.");
      return;
    }
    if (!planGuarnicao) {
      setError("Selecione a guarnição do novo item.");
      return;
    }
    if (!planAssistida?.id) {
      setError("Selecione uma assistida.");
      return;
    }
    if (!planTipo) {
      setError("Selecione o tipo de visita.");
      return;
    }

    setPlanBusy(true);
    try {
      const g = String(planGuarnicao).trim();

      const payload: Partial<AgendaItem> = {
        dataDia: dataStr,
        guarnicao: g,
        chaveDiaGuarnicao: `${dataStr}|${g}`,
        idAssistida: planAssistida.id,
        tipoVisita: planTipo, // ✅ salva tipo
        observacoes: planObs.trim() ? planObs.trim() : null,
        ordem: Date.now(),
      };

      await addDoc(collection(db, "agendas_planejadas"), payload as any);

      setAssistidasMap((m) => (m[planAssistida.id] ? m : { ...m, [planAssistida.id]: planAssistida }));

      setPlanMsg("Item adicionado à agenda.");
      setPlanAssistida(null);
      setPlanObs("");
      setPlanTipo("Rondas");
      setReloadKey((x) => x + 1);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao adicionar item.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function removePlanned(agendaId: string) {
    const ok = window.confirm("Excluir este item da agenda planejada?");
    if (!ok) return;

    setDeleteBusyId(agendaId);
    setError(null);
    try {
      await deleteDoc(doc(db, "agendas_planejadas", agendaId));
      setReloadKey((x) => x + 1);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao excluir item.");
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Agenda planejada"
        subheader={`Dia: ${dataStr} • Itens planejados: ${summary.total}`}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={`Pendentes: ${summary.pend}`} variant={summary.pend ? "filled" : "outlined"} />
            <Chip
              label={`Cumpridas (geral): ${summary.doneAny}/${summary.total} (${pct(summary.doneAny, summary.total)}%)`}
              color={summary.doneAny ? "success" : "default"}
              variant="outlined"
            />
            <Chip
              label={`Cumpridas (guarnição): ${summary.doneSame}/${summary.total} (${pct(summary.doneSame, summary.total)}%)`}
              color={summary.doneSame ? "info" : "default"}
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

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
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
            <Select label="Guarnição" value={guarnicao} onChange={(e) => setGuarnicao(e.target.value as GuarnicaoKey)}>
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
            placeholder="Nome, processo, tipo..."
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

          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setReloadKey((x) => x + 1)}>
            Atualizar
          </Button>

          <Button variant={plannerOpen ? "contained" : "outlined"} onClick={() => setPlannerOpen((v) => !v)}>
            {plannerOpen ? "Fechar planejamento" : "Planejar pelo site"}
          </Button>
        </Box>

        {plannerOpen && (
          <>
            <Divider sx={{ my: 2 }} />

            {assistidasErr && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Falha ao listar assistidas: {assistidasErr}
              </Alert>
            )}

            {planMsg && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {planMsg}
              </Alert>
            )}

            <Box
              sx={{
                display: "flex",
                gap: 2,
                alignItems: "center",
                flexWrap: "wrap",
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                mb: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ mr: 1 }}>
                Novo item
              </Typography>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Guarnição</InputLabel>
                <Select
                  label="Guarnição"
                  value={planGuarnicao}
                  onChange={(e) => setPlanGuarnicao(e.target.value as Exclude<GuarnicaoKey, "Todos">)}
                >
                  {GUARNICOES_ONLY.map((g) => (
                    <MenuItem key={g} value={g}>
                      {g}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Tipo da visita</InputLabel>
                <Select label="Tipo da visita" value={planTipo} onChange={(e) => setPlanTipo(e.target.value as TipoVisita)}>
                  {TIPOS_VISITA.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Autocomplete
                options={assistidasOpts}
                value={planAssistida}
                onChange={(_, v) => setPlanAssistida(v)}
                getOptionLabel={(o) => assistidaLabel(o)}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                loading={assistidasBusy}
                loadingText="Carregando..."
                noOptionsText={
                  assistidasBusy
                    ? "Carregando..."
                    : assistidasErr
                    ? "Falha ao carregar (veja o alerta acima)"
                    : "Nenhuma assistida encontrada"
                }
                onOpen={() => loadAssistidas(false)}
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Assistida" placeholder={assistidasBusy ? "Carregando..." : "Digite para filtrar"} sx={{ minWidth: 420 }} />
                )}
              />

              <TextField
                size="small"
                label="Observações"
                value={planObs}
                onChange={(e) => setPlanObs(e.target.value)}
                sx={{ minWidth: 320 }}
              />

              <Button variant="contained" onClick={addPlanned} disabled={planBusy}>
                {planBusy ? "Adicionando..." : "Adicionar"}
              </Button>

              <Tooltip title="Recarregar lista de assistidas">
                <span>
                  <IconButton onClick={() => loadAssistidas(true)} disabled={assistidasBusy}>
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <Typography variant="caption" color="text.secondary">
                {assistidasBusy
                  ? "Carregando lista..."
                  : assistidasOpts.length
                  ? `${assistidasOpts.length} assistidas carregadas (limitado)`
                  : assistidasErr
                  ? "Lista não carregada (erro)"
                  : "Lista vazia"}
              </Typography>
            </Box>
          </>
        )}

        <Box sx={{ overflow: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Guarnição</TableCell>
                <TableCell>Assistida</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Risco</TableCell>
                <TableCell>Nº Processo</TableCell>
                <TableCell>Cumprida (geral)</TableCell>
                <TableCell>Cumprida (guarnição)</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.agenda.id} hover>
                  <TableCell>{r.idx}</TableCell>
                  <TableCell>{r.guarnicao}</TableCell>

                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {r.nome}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: <code>{r.idAssistida || "—"}</code>
                      </Typography>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Chip size="small" label={r.tipoVisita} variant="outlined" />
                  </TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      label={r.risco}
                      color={norm(r.risco) === "alto" ? "warning" : "default"}
                      variant={norm(r.risco) === "alto" ? "filled" : "outlined"}
                    />
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {r.processo}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    {r.doneAny ? <Chip size="small" label="Sim" color="success" /> : <Chip size="small" label="Não" variant="outlined" />}
                  </TableCell>

                  <TableCell>
                    {r.doneSame ? (
                      <Chip size="small" label="Sim" color="success" />
                    ) : r.doneAny ? (
                      <Chip size="small" label="Outra guarnição" color="info" variant="outlined" />
                    ) : (
                      <Chip size="small" label="Não" variant="outlined" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Tooltip title="Excluir da agenda planejada">
                      <span>
                        <IconButton size="small" onClick={() => removePlanned(r.agenda.id)} disabled={deleteBusyId === r.agenda.id}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum item com esses filtros.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Alert severity="info">
            Critérios: <b>Cumprida (geral)</b> = existe qualquer visita no mesmo dia para a assistida.{" "}
            <b>Cumprida (guarnição)</b> = existe visita no mesmo dia feita pela mesma guarnição.
          </Alert>
        </Box>
      </CardContent>
    </Card>
  );
}
