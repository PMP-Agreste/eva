import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PhoneIcon from '@mui/icons-material/Phone';

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

interface AlertaPanico {
  id: string;
  idAssistida: string;
  nomeAssistida: string;
  guarnicao: string;
  guarnicaoTel: string;
  latitude: number | null;
  longitude: number | null;
  precisaoMetros: number | null;
  timestamp: any;
  status: 'pendente' | 'atendido';
  origem: string;
}

function fmtTs(ts: any): string {
  if (!ts) return '—';
  let ms: number | null = null;
  if (typeof ts === 'number') ms = ts;
  else if (ts?.toMillis) ms = ts.toMillis();
  else if (ts?.seconds) ms = ts.seconds * 1000;
  if (!ms) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ms));
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function AlertasPanicoPage() {
  const [alertas, setAlertas] = useState<AlertaPanico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'alertas_panico'),
      orderBy('timestamp', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAlertas(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AlertaPanico)),
        );
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  async function marcarAtendido(id: string) {
    setAtualizando(id);
    try {
      await updateDoc(doc(db, 'alertas_panico', id), { status: 'atendido' });
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao atualizar.');
    } finally {
      setAtualizando(null);
    }
  }

  const pendentes = alertas.filter((a) => a.status === 'pendente');
  const atendidos = alertas.filter((a) => a.status === 'atendido');

  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader
          avatar={<WarningAmberIcon color="error" />}
          title="Alertas de Pânico"
          subheader="Acionamentos em tempo real — atualizados automaticamente"
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label={`${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''}`}
                color={pendentes.length > 0 ? 'error' : 'default'}
              />
              <Chip label={`${atendidos.length} atendido${atendidos.length !== 1 ? 's' : ''}`} variant="outlined" />
            </Stack>
          }
        />
        {loading && <LinearProgress />}
        {error && (
          <CardContent>
            <Alert severity="error">{error}</Alert>
          </CardContent>
        )}
      </Card>

      {/* PENDENTES */}
      {pendentes.length === 0 && !loading && (
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
              <Typography variant="h6" color="success.main">
                Nenhum alerta pendente
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Todos os alertas foram atendidos ou não há acionamentos.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {pendentes.map((a) => (
        <AlertaCard
          key={a.id}
          alerta={a}
          onAtender={() => void marcarAtendido(a.id)}
          atualizando={atualizando === a.id}
        />
      ))}

      {/* ATENDIDOS */}
      {atendidos.length > 0 && (
        <Card>
          <CardHeader
            title="Atendidos"
            subheader={`${atendidos.length} registro${atendidos.length !== 1 ? 's' : ''}`}
          />
          <CardContent sx={{ pt: 0 }}>
            <Stack spacing={1} divider={<Divider flexItem />}>
              {atendidos.map((a) => (
                <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {a.nomeAssistida || a.idAssistida}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtTs(a.timestamp)} • {a.guarnicao || '—'}
                    </Typography>
                  </Box>
                  <Chip size="small" label="Atendido" color="success" variant="outlined" />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function AlertaCard({
  alerta: a,
  onAtender,
  atualizando,
}: {
  alerta: AlertaPanico;
  onAtender: () => void;
  atualizando: boolean;
}) {
  const temGps = a.latitude != null && a.longitude != null;

  return (
    <Card
      sx={{
        border: '2px solid',
        borderColor: 'error.main',
        boxShadow: (t) => `0 0 24px ${t.palette.error.main}44`,
        animation: 'pulse-border 2s ease-in-out infinite',
        '@keyframes pulse-border': {
          '0%, 100%': { borderColor: 'error.main' },
          '50%': { borderColor: 'error.dark' },
        },
      }}
    >
      <CardHeader
        avatar={
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              bgcolor: 'error.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              animation: 'blink-bg 1.2s ease-in-out infinite',
              '@keyframes blink-bg': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.5 },
              },
            }}
          >
            🆘
          </Box>
        }
        title={
          <Typography variant="h6" sx={{ fontWeight: 900, color: 'error.main' }}>
            {a.nomeAssistida || 'Assistida não identificada'}
          </Typography>
        }
        subheader={`Acionado em: ${fmtTs(a.timestamp)}`}
        action={<Chip label="PENDENTE" color="error" size="small" />}
      />

      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Guarnição
              </Typography>
              <Typography>{a.guarnicao || '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ID da assistida
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.idAssistida}</Typography>
            </Box>
            {temGps && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Precisão GPS
                </Typography>
                <Typography>±{Math.round(a.precisaoMetros ?? 0)} metros</Typography>
              </Box>
            )}
          </Stack>

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
            {temGps && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<MyLocationIcon />}
                href={mapsUrl(a.latitude!, a.longitude!)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
              >
                Ver no mapa
              </Button>
            )}

            {a.guarnicaoTel && (
              <Button
                variant="outlined"
                startIcon={<PhoneIcon />}
                href={`tel:${a.guarnicaoTel.replace(/\D/g, '')}`}
                size="small"
              >
                Ligar para guarnição ({a.guarnicaoTel})
              </Button>
            )}

            <Button
              variant="contained"
              color="success"
              startIcon={atualizando ? undefined : <CheckCircleOutlineIcon />}
              onClick={onAtender}
              disabled={atualizando}
              size="small"
            >
              {atualizando ? 'Atualizando…' : 'Marcar como atendido'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
