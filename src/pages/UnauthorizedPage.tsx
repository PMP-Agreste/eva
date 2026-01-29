import { Box, Card, CardContent, CardHeader, Typography } from '@mui/material';

export function UnauthorizedPage() {
  return (
    <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 'min(720px, 100%)' }}>
        <CardHeader title="Acesso não autorizado" />
        <CardContent>
          <Typography>Seu perfil não tem permissão para acessar o Painel do Gestor.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Verifique se <code>role</code> é <code>admin</code> ou <code>gestor</code>.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
