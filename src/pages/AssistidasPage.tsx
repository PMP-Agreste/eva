import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ClearIcon from "@mui/icons-material/Clear";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Link as RouterLink } from "react-router-dom";

import { qAssistidas, listenQuery } from "../services/firestore";
import type { Assistida } from "../types/models";

function mapAssistida(id: string, data: any): Assistida {
  return { id, ...data } as Assistida;
}

type SortKey =
  | "nomeCompleto"
  | "numeroProcesso"
  | "cidade"
  | "bairro"
  | "grauRisco"
  | "dataValidadeMedida";

type SortDir = "asc" | "desc";

function fmtDate(ms: any): string {
  const n = Number(ms);
  if (!n || Number.isNaN(n)) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
      new Date(n)
    );
  } catch {
    return "—";
  }
}

function norm(v: any): string {
  return String(v ?? "").trim().toLowerCase();
}

function compareValues(a: any, b: any): number {
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  const aNumOk = Number.isFinite(na);
  const bNumOk = Number.isFinite(nb);

  if (aNumOk && bNumOk) return na - nb;

  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    sensitivity: "base",
  });
}

function getSortValue(a: Assistida, key: SortKey): any {
  const x: any = a as any;
  switch (key) {
    case "nomeCompleto":
      return x.nomeCompleto ?? "";
    case "numeroProcesso":
      return x.numeroProcesso ?? "";
    case "cidade":
      return x.cidade ?? "";
    case "bairro":
      return x.bairro ?? "";
    case "grauRisco":
      return x.grauRisco ?? "";
    case "dataValidadeMedida":
      return Number(x.dataValidadeMedida ?? 0);
    default:
      return "";
  }
}

export function AssistidasPage() {
  const [items, setItems] = useState<Assistida[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UX: input imediato + debounce para busca
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Loading até primeira resposta do listener
  const [loading, setLoading] = useState(true);

  // Ordenação client-side (sem mexer na query)
  const [sortKey, setSortKey] = useState<SortKey>("nomeCompleto");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Paginação UI (30 por página)
  const ROWS_PER_PAGE = 30;
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const unsub = listenQuery(
      qAssistidas(),
      mapAssistida,
      (arr) => {
        setItems(arr);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = norm(search);
    if (!s) return items;

    return items.filter((a) => {
      const x: any = a as any;

      const nome = norm(x.nomeCompleto);
      const proc = norm(x.numeroProcesso);
      const id = norm(a.id);

      const cidade = norm(x.cidade);
      const bairro = norm(x.bairro);

      const cpf = norm(x.cpf);
      const tel1 = norm(x.telefonePrincipal);
      const telAlt = norm(x.telefoneAlternativo);

      const risco = norm(x.grauRisco);
      const guarn = norm(x.guarnicaoPmp);

      return (
        nome.includes(s) ||
        proc.includes(s) ||
        id.includes(s) ||
        cidade.includes(s) ||
        bairro.includes(s) ||
        cpf.includes(s) ||
        tel1.includes(s) ||
        telAlt.includes(s) ||
        risco.includes(s) ||
        guarn.includes(s)
      );
    });
  }, [items, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];

    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return compareValues(va, vb) * dir;
    });

    return arr;
  }, [filtered, sortKey, sortDir]);

  // reset para primeira página quando muda filtro/ordenação
  useEffect(() => {
    setPage(0);
  }, [search, sortKey, sortDir, items.length]);

  const filteredCount = sorted.length;
  const loadedCount = items.length; // <= 200 por causa do limit na query (se houver)

  const isPermError = (error ?? "")
    .toLowerCase()
    .includes("insufficient permissions");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // sem snackbar por enquanto
    }
  }

  // Paginação (UI)
  const start = page * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const paged = sorted.slice(start, end);

  return (
    <Card>
      <CardHeader
        title="Assistidas"
        subheader="orderBy nomeCompleto, limit 200"
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip label={`${filteredCount} encontrados`} />
            <Chip variant="outlined" label={`${loadedCount} carregados (máx 200)`} />
            <Button
              component={RouterLink}
              to="/assistidas/nova"
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
            >
              Cadastrar
            </Button>
          </Box>
        }
      />

      <CardContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isPermError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Sem permissão para listar assistidas. Verifique se seu usuário está{" "}
            <b>ativo</b> e com <b>perfil/role</b> autorizado.
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
          <TextField
            label="Buscar (nome, processo, cidade, bairro, cpf, telefones, id...)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchInput("");
            }}
            sx={{ minWidth: 420 }}
            InputProps={{
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <Tooltip title="Limpar">
                    <IconButton
                      size="small"
                      onClick={() => setSearchInput("")}
                      aria-label="Limpar busca"
                      edge="end"
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : undefined,
            }}
          />
          <Typography variant="body2" color="text.secondary">
            Dica: pressione <b>Esc</b> para limpar.
          </Typography>
        </Box>

        <Box sx={{ overflow: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortKey === "nomeCompleto" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "nomeCompleto"}
                    direction={sortKey === "nomeCompleto" ? sortDir : "asc"}
                    onClick={() => toggleSort("nomeCompleto")}
                  >
                    Nome
                  </TableSortLabel>
                </TableCell>

                <TableCell
                  sortDirection={sortKey === "numeroProcesso" ? sortDir : false}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  <TableSortLabel
                    active={sortKey === "numeroProcesso"}
                    direction={sortKey === "numeroProcesso" ? sortDir : "asc"}
                    onClick={() => toggleSort("numeroProcesso")}
                  >
                    Processo
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel
                    active={sortKey === "cidade"}
                    direction={sortKey === "cidade" ? sortDir : "asc"}
                    onClick={() => toggleSort("cidade")}
                  >
                    Cidade / Bairro
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ display: { xs: "none", sm: "table-cell" }, whiteSpace: "nowrap" }}>
                  <TableSortLabel
                    active={sortKey === "grauRisco"}
                    direction={sortKey === "grauRisco" ? sortDir : "asc"}
                    onClick={() => toggleSort("grauRisco")}
                  >
                    Risco
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ display: { xs: "none", md: "table-cell" }, whiteSpace: "nowrap" }}>
                  <TableSortLabel
                    active={sortKey === "dataValidadeMedida"}
                    direction={sortKey === "dataValidadeMedida" ? sortDir : "asc"}
                    onClick={() => toggleSort("dataValidadeMedida")}
                  >
                    Medida até
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>
                  Guarnição / Turno
                </TableCell>

                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  Ações
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paged.map((a) => {
                const x: any = a as any;

                const cidade = x.cidade ?? "—";
                const bairro = x.bairro ?? "—";
                const risco = x.grauRisco ?? "—";
                const validade = fmtDate(x.dataValidadeMedida);

                const guarn = x.guarnicaoPmp ?? "—";
                const turno = x.melhorTurnoFiscalizacao ?? "—";

                const processo = String(x.numeroProcesso ?? "").trim();

                return (
                  <TableRow key={a.id} hover>
                    <TableCell sx={{ minWidth: 240 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {x.nomeCompleto ?? <em>—</em>}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {x.cpf ? `CPF: ${x.cpf}` : ""}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {processo ? processo : <em>—</em>}
                    </TableCell>

                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Typography variant="body2">{cidade}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {bairro}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" }, whiteSpace: "nowrap" }}>
                      <Chip size="small" label={risco} variant="outlined" />
                    </TableCell>

                    <TableCell sx={{ display: { xs: "none", md: "table-cell" }, whiteSpace: "nowrap" }}>
                      {validade}
                    </TableCell>

                    <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>
                      <Typography variant="body2">{guarn}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {turno}
                      </Typography>
                    </TableCell>

                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {processo && (
                        <Tooltip title="Copiar nº do processo">
                          <IconButton
                            size="small"
                            onClick={() => copyText(processo)}
                            aria-label="Copiar processo"
                            sx={{ mr: 1 }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}

                      <Button
                        component={RouterLink}
                        to={`/assistidas/${a.id}/editar`}
                        size="small"
                        startIcon={<EditIcon />}
                        variant="outlined"
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum registro encontrado.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={filteredCount}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} de ${count !== -1 ? count : `mais de ${to}`}`
            }
          />
        </Box>
      </CardContent>
    </Card>
  );
}
