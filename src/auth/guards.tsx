import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from './useAuth';
import type { UserRole } from '../types/models';

function CenterLoading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', gap: 2 }}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <CenterLoading label="Validando sessão…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireProfile({ children }: { children: React.ReactNode }) {
  const { profile, profileLoading, error } = useAuth();

  if (profileLoading) return <CenterLoading label="Carregando perfil…" />;

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">Erro ao carregar perfil</Typography>
        <Typography variant="body2" color="text.secondary">{error}</Typography>
      </Box>
    );
  }

  if (!profile) return <Navigate to="/perfil-nao-encontrado" replace />;
  return <>{children}</>;
}


export function RequireActive({ children }: { children: React.ReactNode }) {
  const { profile, profileLoading } = useAuth();
  if (profileLoading) return <CenterLoading label="Validando permissões…" />;
  if (!profile) return <Navigate to="/perfil-nao-encontrado" replace />;
  if (!profile.ativo) return <Navigate to="/pendente" replace />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, profileLoading } = useAuth();
  if (profileLoading) return <CenterLoading label="Validando permissões…" />;

  const role = (profile?.role ?? 'guarnicao') as UserRole;
  if (!roles.includes(role)) return <Navigate to="/nao-autorizado" replace />;
  return <>{children}</>;
}

export function RequireGestor({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RequireProfile>
        <RequireActive>
          <RequireRole roles={['admin', 'gestor']}>{children}</RequireRole>
        </RequireActive>
      </RequireProfile>
    </RequireAuth>
  );
}
