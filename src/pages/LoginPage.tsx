import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, CardHeader, TextField, Typography } from '@mui/material';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { user, profile, profileLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    if (profileLoading) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
          <Typography variant="body2" color="text.secondary">Carregando perfil…</Typography>
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
      setErr(error?.message ?? 'Falha no login.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 'min(460px, 100%)' }}>
        <CardHeader title={<Typography variant="h5">Eva — Painel do Gestor</Typography>} subheader="Acesse com sua conta autorizada no Firebase." />
        <CardContent>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Box component="form" onSubmit={handle} sx={{ display: 'grid', gap: 2 }}>
            <TextField label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            <TextField label="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} type="password" required />
            <Button type="submit" variant="contained" disabled={submitting}>Entrar</Button>
            <Typography variant="body2" color="text.secondary">
              O acesso depende do perfil em <code>users/&lt;uid&gt;</code> com <code>ativo=true</code> e <code>role</code> = <code>admin</code> ou <code>gestor</code>.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
