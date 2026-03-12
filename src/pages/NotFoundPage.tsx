import { Box, Card, CardContent, CardHeader, Typography } from '@mui/material';

export function NotFoundPage() {
  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 'min(720px, 100%)' }}>
        <CardHeader title="Página não encontrada" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">Verifique o endereço e tente novamente.</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
