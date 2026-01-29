import { Navigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, CardHeader, Typography } from '@mui/material';
import { useAuth } from '../auth/useAuth';

export function PendingActivationPage() {
  const { user, profile, signOutNow } = useAuth();

  // Se já está ativo, redireciona automaticamente
  if (profile?.ativo) {
    if (profile.role === 'gestor' || profile.role === 'admin') {
      return <Navigate to="/" replace />;
    }
    return <Navigate to="/nao-autorizado" replace />;
  }

  return (
    <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 'min(720px, 100%)' }}>
        <CardHeader title="Acesso pendente" />
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="body1">
            Sua conta está autenticada, mas o seu perfil não está ativo no sistema.
          </Typography>

          <Typography variant="body2" color="text.secondary">
            UID: <code>{user?.uid ?? '-'}</code>
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Ativo: <b>{profile?.ativo ? 'Sim' : 'Não'}</b>
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Solicite ao administrador a ativação em <code>users/&lt;uid&gt;</code>.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button variant="outlined" onClick={() => void signOutNow()}>
              Sair
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
