import { Navigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, CardHeader, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../auth/useAuth';

export function ProfileNotFoundPage() {
  const { user, profile, profileLoading, error, signOutNow } = useAuth();

  // Se não tem sessão, volta para login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Enquanto o perfil ainda está carregando, NÃO conclua que "não existe"
  if (profileLoading) {
    return (
      <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2, gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Carregando perfil…
        </Typography>
      </Box>
    );
  }

  // Se o perfil existe, redireciona para o lugar correto
  if (profile) {
    if (!profile.ativo) return <Navigate to="/pendente" replace />;
    if (profile.role === 'admin' || profile.role === 'gestor') return <Navigate to="/" replace />;
    return <Navigate to="/nao-autorizado" replace />;
  }

  // Se houve erro no snapshot
  if (error) {
    return (
      <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ width: 'min(760px, 100%)' }}>
          <CardHeader title="Erro ao carregar perfil" />
          <CardContent sx={{ display: 'grid', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">{error}</Typography>
            <Button variant="outlined" onClick={() => void signOutNow()}>Sair</Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Caso raro: perfil realmente não existe
  return (
    <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 'min(760px, 100%)' }}>
        <CardHeader title="Perfil não encontrado" />
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Typography>Você fez login, mas não existe um documento em <code>users/&lt;uid&gt;</code>.</Typography>
          <Typography variant="body2" color="text.secondary">UID: <code>{user.uid}</code></Typography>
          <Typography variant="body2" color="text.secondary">Crie o perfil e configure <code>ativo</code> e <code>role</code>.</Typography>
          <Button variant="outlined" onClick={() => void signOutNow()}>Sair</Button>
        </CardContent>
      </Card>
    </Box>
  );
}
