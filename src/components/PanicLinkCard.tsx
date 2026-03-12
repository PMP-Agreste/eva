import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ⚠️  Altere para a URL real do seu PWA após o deploy
const PWA_BASE_URL = 'https://eva-panico.netlify.app';

interface Props {
  assistidaId: string;
  nomeAssistida: string;
  guarnicaoNome?: string;
  telefonePrincipal?: string;
}

interface TokenDoc {
  id: string;
  idAssistida: string;
  guarnicaoTel: string;
  guarnicaoNome: string;
  ativo: boolean;
  criadoEm: unknown;
}

export function PanicLinkCard({ assistidaId, nomeAssistida, guarnicaoNome = '', telefonePrincipal = '' }: Props) {
  const [token, setToken] = useState<TokenDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tel da guarnição — editável antes de gerar
  const [guarnicaoTel, setGuarnicaoTel] = useState('');

  // Carrega token existente para esta assistida
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'panic_tokens'),
          where('idAssistida', '==', assistidaId),
          where('ativo', '==', true),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data() as Omit<TokenDoc, 'id'>;
          setToken({ id: d.id, ...data });
          setGuarnicaoTel(data.guarnicaoTel ?? '');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Erro ao verificar token.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (assistidaId) void load();
    return () => { cancelled = true; };
  }, [assistidaId]);

  const panicUrl = token ? `${PWA_BASE_URL}/?token=${token.id}` : null;

  async function gerarLink() {
    setGenerating(true);
    setError(null);
    try {
      // Desativa tokens anteriores
      if (token) {
        await updateDoc(doc(db, 'panic_tokens', token.id), { ativo: false });
      }

      const docRef = await addDoc(collection(db, 'panic_tokens'), {
        idAssistida:    assistidaId,
        nomeAssistida:  nomeAssistida.trim(),
        guarnicaoTel:   guarnicaoTel.trim(),
        guarnicaoNome:  guarnicaoNome.trim(),
        ativo:          true,
        criadoEm:       serverTimestamp(),
      });

      setToken({
        id: docRef.id,
        idAssistida: assistidaId,
        guarnicaoTel: guarnicaoTel.trim(),
        guarnicaoNome: guarnicaoNome.trim(),
        ativo: true,
        criadoEm: null,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao gerar link.');
    } finally {
      setGenerating(false);
    }
  }

  async function copiarLink() {
    if (!panicUrl) return;
    try {
      await navigator.clipboard.writeText(panicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  }

  function abrirWhatsApp() {
    if (!panicUrl || !telefonePrincipal) return;
    const tel = telefonePrincipal.replace(/\D/g, '');
    const nome = encodeURIComponent(nomeAssistida.split(' ')[0] ?? nomeAssistida);
    const url = encodeURIComponent(panicUrl);
    const msg = `Ol%C3%A1%20${nome}!%20Seu%20Bot%C3%A3o%20de%20P%C3%A2nico%20da%20Patrulha%20Maria%20da%20Penha%20est%C3%A1%20pronto.%20Abra%20o%20link%20e%20instale%20no%20seu%20celular%3A%20${url}`;
    window.open(`https://wa.me/55${tel}?text=${msg}`, '_blank');
  }

  if (loading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">Verificando botão de pânico…</Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderColor: token ? 'success.dark' : 'warning.dark' }}>
      <CardHeader
        avatar={<WarningAmberIcon color={token ? 'success' : 'warning'} />}
        title="Botão de Pânico"
        subheader={
          token
            ? 'Link ativo — a assistida pode usar o botão de pânico'
            : 'Nenhum link gerado ainda para esta assistida'
        }
        action={
          token
            ? <Chip size="small" label="Ativo" color="success" variant="outlined" />
            : <Chip size="small" label="Pendente" color="warning" variant="outlined" />
        }
      />

      <CardContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack spacing={2}>
          {/* Configuração do tel da guarnição */}
          <TextField
            label="Telefone da guarnição (para o botão de chamada no app)"
            placeholder="819XXXXXXX"
            value={guarnicaoTel}
            onChange={(e) => setGuarnicaoTel(e.target.value)}
            size="small"
            fullWidth
            inputMode="tel"
            helperText="Este número aparece como botão de chamada rápida no app da assistida."
          />

          {/* Link gerado */}
          {panicUrl && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Link do botão de pânico
              </Typography>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  mt: 0.5,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <LinkIcon fontSize="small" color="action" />
                <Typography
                  variant="body2"
                  sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.78rem' }}
                >
                  {panicUrl}
                </Typography>
                <Tooltip title={copied ? 'Copiado!' : 'Copiar link'}>
                  <IconButton size="small" onClick={copiarLink} color={copied ? 'success' : 'default'}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          )}

          <Divider />

          {/* Ações */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
            <Button
              variant={token ? 'outlined' : 'contained'}
              color={token ? 'inherit' : 'error'}
              startIcon={generating ? <CircularProgress size={16} /> : token ? <RefreshIcon /> : <WarningAmberIcon />}
              onClick={() => void gerarLink()}
              disabled={generating}
              size="small"
            >
              {token ? 'Gerar novo link' : 'Gerar link de pânico'}
            </Button>

            {panicUrl && (
              <Button
                variant="contained"
                color="success"
                startIcon={<WhatsAppIcon />}
                onClick={abrirWhatsApp}
                disabled={!telefonePrincipal}
                size="small"
                title={!telefonePrincipal ? 'Cadastre o telefone da assistida primeiro' : ''}
              >
                Enviar por WhatsApp
              </Button>
            )}

            {panicUrl && (
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={copiarLink}
                size="small"
                color={copied ? 'success' : 'inherit'}
              >
                {copied ? 'Copiado!' : 'Copiar link'}
              </Button>
            )}
          </Stack>

          {token && (
            <Alert severity="info" variant="outlined" sx={{ fontSize: '0.8rem' }}>
              <strong>Como usar:</strong> Copie o link ou envie por WhatsApp para a assistida. Ela abre o link no celular,
              instala na tela inicial e, em emergência, toca em <strong>SOCORRO</strong>. O alerta aparece em tempo real
              na aba <strong>Alertas de Pânico</strong> do painel.
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
