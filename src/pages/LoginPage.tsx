import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldIcon from '@mui/icons-material/Shield';
import { useAuth } from '../auth/useAuth';

const ROSE = '#F472B6';
const ROSE_DARK = '#EC4899';
const BG = '#080E1C';

export function LoginPage() {
  const { user, profile, profileLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    if (profileLoading) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: BG,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={24} sx={{ color: ROSE }} />
            <Typography variant="body2" color="text.secondary">
              Carregando perfil…
            </Typography>
          </Box>
        </Box>
      );
    }

    if (!profile) return <Navigate to="/perfil-nao-encontrado" replace />;
    if (!profile.ativo) return <Navigate to="/pendente" replace />;
    return <Navigate to="/" replace />;
  }

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), senha);
    } catch (error: any) {
      setErr(error?.message ?? 'Falha no login. Verifique suas credenciais.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BG,
        position: 'relative',
        overflow: 'hidden',
        p: 2,
      }}
    >
      {/* Background decorative elements */}
      <Box
        sx={{
          position: 'absolute',
          top: '-20%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(244,114,182,0.07) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: '40vw',
          height: '40vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Grid pattern overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Login Card */}
      <Box
        component="form"
        onSubmit={handle}
        sx={{
          width: '100%',
          maxWidth: 420,
          position: 'relative',
          zIndex: 1,
          background: 'rgba(15, 23, 41, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '20px',
          p: { xs: 3, sm: 4 },
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Logo */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '16px',
              background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DARK} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
              boxShadow: `0 0 32px rgba(244,114,182,0.35), 0 8px 24px rgba(0,0,0,0.3)`,
            }}
          >
            <ShieldIcon sx={{ fontSize: 28, color: '#fff' }} />
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1.5rem',
              letterSpacing: '-0.03em',
              color: '#F1F5F9',
              lineHeight: 1,
              mb: 0.5,
            }}
          >
            Eva
          </Typography>
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: '#64748B',
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            Painel Operacional do Gestor
          </Typography>
        </Box>

        <Typography
          sx={{
            fontSize: '1.0625rem',
            fontWeight: 700,
            color: '#E2E8F0',
            mb: 0.5,
            letterSpacing: '-0.01em',
          }}
        >
          Acesse sua conta
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#64748B', mb: 3 }}>
          Entre com suas credenciais autorizadas para continuar.
        </Typography>

        {err && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: '10px',
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.25)',
              color: '#FCA5A5',
              '& .MuiAlert-icon': { color: '#F87171' },
            }}
          >
            {err}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <TextField
            label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            fullWidth
            autoComplete="email"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailOutlinedIcon sx={{ fontSize: 17, color: '#475569' }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            type="password"
            required
            fullWidth
            autoComplete="current-password"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ fontSize: 17, color: '#475569' }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Button
          type="submit"
          variant="contained"
          disabled={submitting}
          fullWidth
          size="large"
          sx={{
            py: 1.5,
            fontSize: '0.9375rem',
            fontWeight: 700,
            borderRadius: '10px',
            letterSpacing: '-0.01em',
            mb: 3,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {submitting ? (
            <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,0.8)' }} />
          ) : (
            'Entrar no sistema'
          )}
        </Button>

        <Box
          sx={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            pt: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.6 }}>
            O acesso requer perfil cadastrado com{' '}
            <Box component="code" sx={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', background: 'rgba(255,255,255,0.07)', px: 0.5, py: 0.25, borderRadius: '4px' }}>
              ativo=true
            </Box>{' '}
            e{' '}
            <Box component="code" sx={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', background: 'rgba(255,255,255,0.07)', px: 0.5, py: 0.25, borderRadius: '4px' }}>
              role=admin
            </Box>{' '}
            ou{' '}
            <Box component="code" sx={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', background: 'rgba(255,255,255,0.07)', px: 0.5, py: 0.25, borderRadius: '4px' }}>
              gestor
            </Box>.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
