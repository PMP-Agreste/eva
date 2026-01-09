import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

type BoolTri = null | boolean;

const CIDADES = ['Arapiraca', 'Craíbas', 'Coité do Nóia', 'Feira Grande', 'Limoeiro de Anadia', 'Taquarana'] as const;
const GUARNICOES = ['PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

const LOCAIS_FISCALIZACAO = ['Residência', 'Trabalho', 'Escola/Creche', 'Unidade de Saúde', 'Via pública', 'Outro'] as const;
const TURNOS_FISCALIZACAO = ['Manhã', 'Tarde', 'Noite', 'Madrugada', 'Indiferente'] as const;

const ESTADOS_CIVIS = ['Solteira', 'Casada', 'União estável', 'Separada', 'Divorciada', 'Viúva'] as const;

const QTD_FILHOS = ['0', '1', '2', '3', '4', '5+'] as const;

const FAIXAS_ETARIAS_FILHOS = ['(0 a 4 anos)', '5 a 10 anos', '11 a 13 anos', '14 a 17 anos', '18+'] as const;

const RESPONSAVEL_SUSTENTO = [
  'A Própria',
  'O Agressor',
  'Pai/Mãe',
  'Outros familiares',
  'Benefícios/Programas sociais',
  'Outra pessoa',
] as const;

const BENEFICIOS_GOVERNO = [
  'Não',
  'Bolsa Família',
  'Benefício de Prestação Continuada',
  'Minha Casa Minha Vida',
  'Primeiro Passo',
  'Outro',
] as const;

const TIPOS_VIOLENCIA = ['Física', 'Psicológica', 'Moral', 'Sexual', 'Patrimonial'] as const;
const GRAU_RISCO = ['Baixo', 'Médio', 'Alto'] as const;

type AssistidaDoc = {
  nomeCompleto: string;
  idade?: number | null;
  rg?: string | null;
  cpf?: string | null;

  telefonePrincipal?: string | null;
  telefoneAlternativo?: string | null;

  cidade?: string | null;
  guarnicaoPmp?: string | null;

  bairro?: string | null;
  logradouro?: string | null;
  numero?: string | null;

  numeroProcesso?: string | null;

  dataValidadeMedida?: number | null;

  localFiscalizacao?: string | null;
  melhorTurnoFiscalizacao?: string | null;
  estadoCivil?: string | null;

  possuiFilhos?: boolean | null;
  quantidadeFilhos?: string | null;
  faixaEtariaFilhos?: string | null;

  possuiFilhosComAgressor?: boolean | null;
  quantidadeFilhosComAgressor?: string | null;

  profissao?: string | null;
  localTrabalho?: string | null;

  principalResponsavelSustento?: string | null;

  beneficioGoverno?: string | null;
  possuiNis?: boolean | null;
  numeroNis?: string | null;

  tiposViolenciaSofrida?: string[];
  localAgressao?: string | null;

  grauRisco?: string | null;
  dataAvaliacaoRisco?: number | null;

  latitude?: number | null;
  longitude?: number | null;

  fotoUrl?: string | null;
  ativa?: boolean | null;

  [key: string]: unknown;
};

function cleanText(v: string): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

function parseIntOrNull(v: string): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseFloatOrNull(v: string): number | null {
  const t = (v ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function temBeneficio(beneficio: string | null) {
  const b = (beneficio ?? 'Não').trim();
  return b.length > 0 && b !== 'Não';
}

function boolTriFromSelect(v: string): BoolTri {
  if (v === 'Sim') return true;
  if (v === 'Não') return false;
  return null;
}

function boolTriToSelect(v: BoolTri): string {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  return '';
}

function msToDateInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToMs(value: string): number | null {
  const t = (value ?? '').trim();
  if (!t) return null;
  // YYYY-MM-DD
  const [y, m, d] = t.split('-').map((x) => Number(x));
  if (!y || !m || !d) return null;
  const local = new Date(y, m - 1, d, 0, 0, 0, 0);
  return local.getTime();
}

async function uploadFotoAssistida(idAssistida: string, file: File): Promise<string> {
  const filename = `${idAssistida}-${Date.now()}.jpg`;
  const r = ref(storage, `assistidas/${filename}`);
  const snap = await uploadBytes(r, file);
  return await getDownloadURL(snap.ref);
}

async function tryDeleteByUrl(url: string | null | undefined) {
  if (!url) return;
  try {
    const r = ref(storage, url);
    await deleteObject(r);
  } catch {
    // Ignora falhas (URL pode não ser ref válida, permissões, etc.)
  }
}

export function AssistidaFormPage() {
  const nav = useNavigate();
  const { id } = useParams();

  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [docOriginal, setDocOriginal] = useState<AssistidaDoc | null>(null);

  // Foto
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const fotoPreview = useMemo(() => {
    if (fotoFile) return URL.createObjectURL(fotoFile);
    return fotoUrl ?? null;
  }, [fotoFile, fotoUrl]);

  // Campos
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [idade, setIdade] = useState('');
  const [rg, setRg] = useState('');
  const [cpf, setCpf] = useState('');

  const [telefonePrincipal, setTelefonePrincipal] = useState('');
  const [telefoneAlternativo, setTelefoneAlternativo] = useState('');

  const [cidade, setCidade] = useState<string>('');
  const [guarnicaoPmp, setGuarnicaoPmp] = useState<string>('');

  const [bairro, setBairro] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numeroResidencia, setNumeroResidencia] = useState('');

  const [numeroProcesso, setNumeroProcesso] = useState('');

  const [dataValidadeMedida, setDataValidadeMedida] = useState<string>('');

  const [localFiscalizacao, setLocalFiscalizacao] = useState<string>('');
  const [melhorTurnoFiscalizacao, setMelhorTurnoFiscalizacao] = useState<string>('');
  const [estadoCivil, setEstadoCivil] = useState<string>('');

  const [possuiFilhos, setPossuiFilhos] = useState<BoolTri>(null);
  const [quantidadeFilhos, setQuantidadeFilhos] = useState<string>('');
  const [faixaEtariaFilhos, setFaixaEtariaFilhos] = useState<string>('');

  const [possuiFilhosComAgressor, setPossuiFilhosComAgressor] = useState<BoolTri>(null);
  const [quantidadeFilhosComAgressor, setQuantidadeFilhosComAgressor] = useState<string>('');

  const [profissao, setProfissao] = useState('');
  const [localTrabalho, setLocalTrabalho] = useState('');

  const [principalResponsavelSustento, setPrincipalResponsavelSustento] = useState<string>('');

  const [beneficioGoverno, setBeneficioGoverno] = useState<string>('Não');
  const [possuiNis, setPossuiNis] = useState<BoolTri>(null);
  const [numeroNis, setNumeroNis] = useState('');

  const [tiposViolencia, setTiposViolencia] = useState<Set<string>>(new Set());
  const [localAgressao, setLocalAgressao] = useState('');

  const [grauRisco, setGrauRisco] = useState<string>('');

  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const podeNis = temBeneficio(beneficioGoverno);

  useEffect(() => {
    if (!podeNis) {
      setPossuiNis(null);
      setNumeroNis('');
    }
  }, [podeNis]);

  useEffect(() => {
    if (possuiFilhos !== true) {
      setQuantidadeFilhos('');
      setFaixaEtariaFilhos('');
    }
  }, [possuiFilhos]);

  useEffect(() => {
    if (possuiFilhosComAgressor !== true) {
      setQuantidadeFilhosComAgressor('');
    }
  }, [possuiFilhosComAgressor]);

  // Carrega doc para edição
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isEdit || !id) return;

      setLoading(true);
      setError(null);

      try {
        const snap = await getDoc(doc(db, 'assistidas', id));
        if (!snap.exists()) throw new Error('Assistida não encontrada.');

        const data = snap.data() as AssistidaDoc;
        if (cancelled) return;

        setDocOriginal(data);

        setFotoUrl((data.fotoUrl as string) ?? null);

        setNomeCompleto(String(data.nomeCompleto ?? ''));
        setIdade(data.idade != null ? String(data.idade) : '');
        setRg(String(data.rg ?? ''));
        setCpf(String(data.cpf ?? ''));

        setTelefonePrincipal(String(data.telefonePrincipal ?? ''));
        setTelefoneAlternativo(String(data.telefoneAlternativo ?? ''));

        setCidade(String(data.cidade ?? ''));
        setGuarnicaoPmp(String(data.guarnicaoPmp ?? ''));

        setBairro(String(data.bairro ?? ''));
        setLogradouro(String(data.logradouro ?? ''));
        setNumeroResidencia(String(data.numero ?? ''));

        setNumeroProcesso(String(data.numeroProcesso ?? ''));

        setDataValidadeMedida(msToDateInput(data.dataValidadeMedida as number | null));

        setLocalFiscalizacao(String(data.localFiscalizacao ?? ''));
        setMelhorTurnoFiscalizacao(String(data.melhorTurnoFiscalizacao ?? ''));
        setEstadoCivil(String(data.estadoCivil ?? ''));

        setPossuiFilhos((data.possuiFilhos as any) ?? null);
        setQuantidadeFilhos(String(data.quantidadeFilhos ?? ''));
        setFaixaEtariaFilhos(String(data.faixaEtariaFilhos ?? ''));

        setPossuiFilhosComAgressor((data.possuiFilhosComAgressor as any) ?? null);
        setQuantidadeFilhosComAgressor(String(data.quantidadeFilhosComAgressor ?? ''));

        setProfissao(String(data.profissao ?? ''));
        setLocalTrabalho(String(data.localTrabalho ?? ''));

        setPrincipalResponsavelSustento(String(data.principalResponsavelSustento ?? ''));

        setBeneficioGoverno(String(data.beneficioGoverno ?? 'Não'));
        setPossuiNis((data.possuiNis as any) ?? null);
        setNumeroNis(String(data.numeroNis ?? ''));

        const tv = Array.isArray(data.tiposViolenciaSofrida) ? data.tiposViolenciaSofrida : [];
        setTiposViolencia(new Set(tv.map(String)));

        setLocalAgressao(String(data.localAgressao ?? ''));

        setGrauRisco(String(data.grauRisco ?? ''));

        setLatitude(data.latitude != null ? String(data.latitude) : '');
        setLongitude(data.longitude != null ? String(data.longitude) : '');
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Falha ao carregar a assistida.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  function toggleTipoViolencia(tipo: string, checked: boolean) {
    setTiposViolencia((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tipo);
      else next.delete(tipo);
      return next;
    });
  }

  async function obterLocalizacaoAtual() {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste navegador.');
      return;
    }
    setGeoLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setGeoLoading(false);
      },
      (err) => {
        setError(`Não foi possível obter localização: ${err.message}`);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function salvar() {
    setError(null);

    if (!nomeCompleto.trim()) {
      setError('Informe o nome completo da assistida.');
      return;
    }

    setSaving(true);

    try {
      const tiposViolenciaSorted = Array.from(tiposViolencia).sort();

      const payloadBase: Partial<AssistidaDoc> = {
        nomeCompleto: nomeCompleto.trim(),
        idade: parseIntOrNull(idade),
        rg: cleanText(rg),
        cpf: cleanText(cpf),

        telefonePrincipal: cleanText(telefonePrincipal),
        telefoneAlternativo: cleanText(telefoneAlternativo),

        cidade: cleanText(cidade),
        guarnicaoPmp: cleanText(guarnicaoPmp),

        bairro: cleanText(bairro),
        logradouro: cleanText(logradouro),
        numero: cleanText(numeroResidencia),

        numeroProcesso: cleanText(numeroProcesso),

        dataValidadeMedida: dateInputToMs(dataValidadeMedida),

        localFiscalizacao: cleanText(localFiscalizacao),
        melhorTurnoFiscalizacao: cleanText(melhorTurnoFiscalizacao),
        estadoCivil: cleanText(estadoCivil),

        possuiFilhos,
        quantidadeFilhos: possuiFilhos === true ? cleanText(quantidadeFilhos) : null,
        faixaEtariaFilhos: possuiFilhos === true ? cleanText(faixaEtariaFilhos) : null,

        possuiFilhosComAgressor,
        quantidadeFilhosComAgressor: possuiFilhosComAgressor === true ? cleanText(quantidadeFilhosComAgressor) : null,

        profissao: cleanText(profissao),
        localTrabalho: cleanText(localTrabalho),

        principalResponsavelSustento: cleanText(principalResponsavelSustento),

        beneficioGoverno: cleanText(beneficioGoverno),
        possuiNis: podeNis ? possuiNis : null,
        numeroNis: podeNis && possuiNis === true ? cleanText(numeroNis) : null,

        tiposViolenciaSofrida: tiposViolenciaSorted,
        localAgressao: cleanText(localAgressao),

        grauRisco: cleanText(grauRisco),

        latitude: parseFloatOrNull(latitude),
        longitude: parseFloatOrNull(longitude),
      };

      // dataAvaliacaoRisco: no Android, só define no cadastro se grauRisco != null
      // Na web, vamos:
      // - criação: se informou grauRisco => define agora
      // - edição: mantém a existente (não altera), a menos que você queira forçar recalcular
      if (!isEdit) {
        payloadBase.dataAvaliacaoRisco = payloadBase.grauRisco ? Date.now() : null;
        payloadBase.ativa = true;
      }

      if (!isEdit) {
        // CREATE
        const created = await addDoc(collection(db, 'assistidas'), payloadBase);
        const newId = created.id;

        // Foto
        if (fotoFile) {
          const url = await uploadFotoAssistida(newId, fotoFile);
          await updateDoc(doc(db, 'assistidas', newId), { fotoUrl: url });
        }

        nav('/assistidas');
        return;
      }

      // UPDATE
      if (!id) throw new Error('ID inválido.');

      await updateDoc(doc(db, 'assistidas', id), payloadBase);

      if (fotoFile) {
        // Opcional: tentar excluir antiga
        await tryDeleteByUrl(docOriginal?.fotoUrl as any);
        const url = await uploadFotoAssistida(id, fotoFile);
        await updateDoc(doc(db, 'assistidas', id), { fotoUrl: url });
      }

      nav('/assistidas');
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader
          title={isEdit ? 'Editar Assistida' : 'Cadastrar Assistida'}
          subheader="Campos e regras espelhados do app Android"
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              <Button component={RouterLink} to="/assistidas" startIcon={<ArrowBackIcon />} variant="outlined" size="small">
                Voltar
              </Button>
              <Button onClick={() => void salvar()} startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />} variant="contained" size="small" disabled={saving || loading}>
                {isEdit ? 'Salvar alterações' : 'Salvar'}
              </Button>
            </Stack>
          }
        />
        <CardContent>
          {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
          {loading ? <Chip label="Carregando assistida…" /> : null}

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* Foto */}
            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <Avatar src={fotoPreview ?? undefined} sx={{ width: 84, height: 84 }}>
                      <PhotoCameraIcon />
                    </Avatar>

                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>Foto da assistida</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Selecione uma imagem. Será enviada para o Firebase Storage e gravada em <code>fotoUrl</code>.
                      </Typography>

                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Button variant="outlined" component="label" startIcon={<PhotoCameraIcon />}>
                          Selecionar foto
                          <input
                            hidden
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setFotoFile(f);
                            }}
                          />
                        </Button>

                        {fotoFile || fotoUrl ? (
                          <Button
                            variant="text"
                            color="inherit"
                            startIcon={<DeleteIcon />}
                            onClick={() => {
                              setFotoFile(null);
                              // não apaga do storage aqui; apenas remove a seleção local
                              // (em edição, se quiser apagar do registro, você pode limpar fotoUrl manualmente depois)
                            }}
                          >
                            Remover seleção
                          </Button>
                        ) : null}

                        {fotoFile ? <Chip size="small" label={fotoFile.name} /> : null}
                      </Stack>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Identificação */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Identificação</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={8}>
              <TextField
                label="Nome completo da assistida"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                fullWidth
                required
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="Idade"
                value={idade}
                onChange={(e) => setIdade(e.target.value)}
                fullWidth
                inputMode="numeric"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="RG" value={rg} onChange={(e) => setRg(e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} fullWidth inputMode="numeric" />
            </Grid>

            {/* Contatos */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Contatos</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Telefone principal" value={telefonePrincipal} onChange={(e) => setTelefonePrincipal(e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Telefone secundário (emergência)" value={telefoneAlternativo} onChange={(e) => setTelefoneAlternativo(e.target.value)} fullWidth />
            </Grid>

            {/* Cidade/Guarnição */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Cidade e Guarnição</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Cidade</InputLabel>
                <Select label="Cidade" value={cidade} onChange={(e) => setCidade(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {CIDADES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Guarnição (Turno PMP)</InputLabel>
                <Select label="Guarnição (Turno PMP)" value={guarnicaoPmp} onChange={(e) => setGuarnicaoPmp(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {GUARNICOES.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* Endereço */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Endereço</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Nº da residência" value={numeroResidencia} onChange={(e) => setNumeroResidencia(e.target.value)} fullWidth />
            </Grid>

            {/* Medida protetiva */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Medida protetiva</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={8}>
              <TextField
                label="Número do processo da medida protetiva"
                value={numeroProcesso}
                onChange={(e) => setNumeroProcesso(e.target.value)}
                fullWidth
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="Data de validade da medida protetiva"
                type="date"
                value={dataValidadeMedida}
                onChange={(e) => setDataValidadeMedida(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Fiscalização */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Fiscalização</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Local da fiscalização</InputLabel>
                <Select label="Local da fiscalização" value={localFiscalizacao} onChange={(e) => setLocalFiscalizacao(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {LOCAIS_FISCALIZACAO.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Melhor turno para fiscalização</InputLabel>
                <Select label="Melhor turno para fiscalização" value={melhorTurnoFiscalizacao} onChange={(e) => setMelhorTurnoFiscalizacao(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {TURNOS_FISCALIZACAO.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Estado civil</InputLabel>
                <Select label="Estado civil" value={estadoCivil} onChange={(e) => setEstadoCivil(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {ESTADOS_CIVIS.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* Filhos */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Filhos</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Possui filhos?</InputLabel>
                <Select label="Possui filhos?" value={boolTriToSelect(possuiFilhos)} onChange={(e) => setPossuiFilhos(boolTriFromSelect(String(e.target.value)))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  <MenuItem value="Sim">Sim</MenuItem>
                  <MenuItem value="Não">Não</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {possuiFilhos === true ? (
              <>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Quantidade de filhos</InputLabel>
                    <Select label="Quantidade de filhos" value={quantidadeFilhos} onChange={(e) => setQuantidadeFilhos(String(e.target.value))}>
                      <MenuItem value=""><em>—</em></MenuItem>
                      {QTD_FILHOS.map((q) => <MenuItem key={q} value={q}>{q}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Faixa etária dos filhos</InputLabel>
                    <Select label="Faixa etária dos filhos" value={faixaEtariaFilhos} onChange={(e) => setFaixaEtariaFilhos(String(e.target.value))}>
                      <MenuItem value=""><em>—</em></MenuItem>
                      {FAIXAS_ETARIAS_FILHOS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </>
            ) : null}

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Possui filhos com o agressor?</InputLabel>
                <Select
                  label="Possui filhos com o agressor?"
                  value={boolTriToSelect(possuiFilhosComAgressor)}
                  onChange={(e) => setPossuiFilhosComAgressor(boolTriFromSelect(String(e.target.value)))}
                >
                  <MenuItem value=""><em>—</em></MenuItem>
                  <MenuItem value="Sim">Sim</MenuItem>
                  <MenuItem value="Não">Não</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {possuiFilhosComAgressor === true ? (
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Quantidade de filhos com o agressor</InputLabel>
                  <Select
                    label="Quantidade de filhos com o agressor"
                    value={quantidadeFilhosComAgressor}
                    onChange={(e) => setQuantidadeFilhosComAgressor(String(e.target.value))}
                  >
                    <MenuItem value=""><em>—</em></MenuItem>
                    {QTD_FILHOS.map((q) => <MenuItem key={q} value={q}>{q}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            ) : null}

            {/* Profissão */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Profissão e trabalho</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Profissão" value={profissao} onChange={(e) => setProfissao(e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Local de trabalho" value={localTrabalho} onChange={(e) => setLocalTrabalho(e.target.value)} fullWidth />
            </Grid>

            {/* Sustento */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Sustento</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Principal responsável pelo sustento da família</InputLabel>
                <Select
                  label="Principal responsável pelo sustento da família"
                  value={principalResponsavelSustento}
                  onChange={(e) => setPrincipalResponsavelSustento(String(e.target.value))}
                >
                  <MenuItem value=""><em>—</em></MenuItem>
                  {RESPONSAVEL_SUSTENTO.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* Benefício / NIS */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Benefício do governo / NIS</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Recebe benefício do governo?</InputLabel>
                <Select
                  label="Recebe benefício do governo?"
                  value={beneficioGoverno}
                  onChange={(e) => setBeneficioGoverno(String(e.target.value))}
                >
                  {BENEFICIOS_GOVERNO.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {podeNis ? (
              <>
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Possui NIS?</InputLabel>
                    <Select
                      label="Possui NIS?"
                      value={boolTriToSelect(possuiNis)}
                      onChange={(e) => setPossuiNis(boolTriFromSelect(String(e.target.value)))}
                    >
                      <MenuItem value=""><em>—</em></MenuItem>
                      <MenuItem value="Sim">Sim</MenuItem>
                      <MenuItem value="Não">Não</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {possuiNis === true ? (
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Nº do NIS"
                      value={numeroNis}
                      onChange={(e) => setNumeroNis(e.target.value)}
                      fullWidth
                      inputMode="numeric"
                    />
                  </Grid>
                ) : null}
              </>
            ) : null}

            {/* Violência */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Violência</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardHeader title="Tipo(s) de violência sofrida" subheader="Seleção múltipla" />
                <CardContent sx={{ pt: 0 }}>
                  <FormGroup>
                    {TIPOS_VIOLENCIA.map((tipo) => (
                      <FormControlLabel
                        key={tipo}
                        control={
                          <Checkbox
                            checked={tiposViolencia.has(tipo)}
                            onChange={(e) => toggleTipoViolencia(tipo, e.target.checked)}
                          />
                        }
                        label={tipo}
                      />
                    ))}
                  </FormGroup>

                  {tiposViolencia.size > 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      Selecionados: {Array.from(tiposViolencia).sort().join(', ')}
                    </Typography>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Local da agressão" value={localAgressao} onChange={(e) => setLocalAgressao(e.target.value)} fullWidth />
            </Grid>

            {/* Risco */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Risco</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Grau de risco</InputLabel>
                <Select label="Grau de risco" value={grauRisco} onChange={(e) => setGrauRisco(String(e.target.value))}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {GRAU_RISCO.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* GPS */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, mt: 1 }}>Localização (GPS)</Typography>
              <Divider sx={{ mt: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} fullWidth placeholder="-9.735000" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} fullWidth placeholder="-36.650000" />
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <Box sx={{ flex: 1 }}>
                      {latitude.trim() && longitude.trim() ? (
                        <Typography>Lat: <b>{latitude.trim()}</b> • Lng: <b>{longitude.trim()}</b></Typography>
                      ) : (
                        <Typography color="text.secondary">
                          Você pode digitar latitude/longitude ou usar o botão para obter pelo GPS do navegador.
                        </Typography>
                      )}
                    </Box>

                    <Button
                      onClick={() => void obterLocalizacaoAtual()}
                      variant="outlined"
                      startIcon={geoLoading ? <CircularProgress size={16} /> : <MyLocationIcon />}
                      disabled={geoLoading}
                    >
                      Obter localização atual
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Rodapé: salvar */}
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button component={RouterLink} to="/assistidas" variant="text" color="inherit" startIcon={<ArrowBackIcon />}>
                  Voltar para Assistidas
                </Button>

                <Button
                  onClick={() => void salvar()}
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                  disabled={saving || loading}
                >
                  {isEdit ? 'Salvar alterações' : 'Salvar'}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Observação técnica" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Nesta implementação, <code>dataValidadeMedida</code> e <code>dataAvaliacaoRisco</code> são gravadas como
            número (epoch em ms), mantendo compatibilidade com o padrão do app Android.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
