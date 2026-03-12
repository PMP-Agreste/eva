import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import MapIcon from '@mui/icons-material/Map';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CrisisAlertIcon from '@mui/icons-material/CrisisAlert';
import LogoutIcon from '@mui/icons-material/Logout';
import ShieldIcon from '@mui/icons-material/Shield';
import { useAuth } from '../auth/useAuth';

const drawerWidth = 256;

const ROSE = '#F472B6';
const ROSE_DARK = '#EC4899';

type NavItem = { label: string; to: string; icon: React.ReactNode; badge?: number };

const nav: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <DashboardIcon sx={{ fontSize: 19 }} /> },
  { label: 'Assistidas', to: '/assistidas', icon: <PeopleIcon sx={{ fontSize: 19 }} /> },
  { label: 'Agenda Planejada', to: '/agenda', icon: <EventNoteIcon sx={{ fontSize: 19 }} /> },
  { label: 'Visitas', to: '/visitas', icon: <FactCheckIcon sx={{ fontSize: 19 }} /> },
  { label: 'Relatório', to: '/relatorios/periodo', icon: <AssessmentOutlinedIcon sx={{ fontSize: 19 }} /> },
  { label: 'Alertas de Pânico', to: '/alertas/panico', icon: <CrisisAlertIcon sx={{ fontSize: 19 }} /> },
  { label: 'Mapa', to: '/mapa', icon: <MapIcon sx={{ fontSize: 19 }} /> },
];

const NAV_GROUPS = [
  { label: 'Principal', items: nav.slice(0, 2) },
  { label: 'Operações', items: nav.slice(2, 5) },
  { label: 'Monitoramento', items: nav.slice(5) },
];

function getInitials(name?: string) {
  if (!name) return 'U';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { profile, signOutNow } = useAuth();

  const displayName = profile?.nomeGuerra ?? profile?.role ?? 'Usuário';
  const roleLabel = profile?.role ? String(profile.role).charAt(0).toUpperCase() + String(profile.role).slice(1) : '';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Top AppBar */}
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ px: { xs: 2, sm: 3 }, minHeight: '56px !important', gap: 2 }}>
          {/* Logo area - matches drawer width */}
          <Box
            sx={{
              width: drawerWidth - 24,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DARK} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 16px rgba(244,114,182,0.4)`,
                flexShrink: 0,
              }}
            >
              <ShieldIcon sx={{ fontSize: 16, color: '#fff' }} />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: '1rem',
                  letterSpacing: '-0.02em',
                  color: '#F1F5F9',
                  lineHeight: 1,
                }}
              >
                Eva
              </Typography>
              <Typography sx={{ fontSize: '0.625rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                Painel do Gestor
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* User area */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#E2E8F0', lineHeight: 1.2 }}>
                {displayName}
              </Typography>
              {roleLabel && (
                <Typography sx={{ fontSize: '0.6875rem', color: '#64748B', lineHeight: 1.2 }}>
                  {roleLabel}
                </Typography>
              )}
            </Box>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DARK} 100%)`,
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#fff',
              }}
            >
              {getInitials(displayName)}
            </Avatar>
            <Tooltip title="Sair do sistema">
              <IconButton
                size="small"
                onClick={() => void signOutNow()}
                sx={{
                  color: '#64748B',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  width: 32,
                  height: 32,
                  '&:hover': {
                    backgroundColor: 'rgba(248,113,113,0.12)',
                    color: '#F87171',
                    borderColor: 'rgba(248,113,113,0.3)',
                  },
                }}
              >
                <LogoutIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />

        <Box sx={{ overflow: 'auto', flex: 1, p: 1.5, display: 'flex', flexDirection: 'column' }}>
          {NAV_GROUPS.map((group, gi) => (
            <Box key={group.label} sx={{ mb: gi < NAV_GROUPS.length - 1 ? 2 : 0 }}>
              <Typography
                variant="overline"
                sx={{
                  px: 1.5,
                  mb: 0.5,
                  display: 'block',
                  color: '#334155',
                  letterSpacing: '0.08em',
                  fontSize: '0.625rem',
                }}
              >
                {group.label}
              </Typography>
              <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {group.items.map((item) => {
                  const selected = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
                  return (
                    <ListItemButton
                      key={item.to}
                      component={Link}
                      to={item.to}
                      selected={selected}
                    >
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText primary={item.label} />
                      {item.badge ? (
                        <Box
                          sx={{
                            ml: 'auto',
                            minWidth: 18,
                            height: 18,
                            borderRadius: '5px',
                            background: 'rgba(248,113,113,0.2)',
                            border: '1px solid rgba(248,113,113,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: '#F87171',
                          }}
                        >
                          {item.badge}
                        </Box>
                      ) : null}
                    </ListItemButton>
                  );
                })}
              </List>
              {gi < NAV_GROUPS.length - 1 && (
                <Divider sx={{ mt: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />
              )}
            </Box>
          ))}

          <Box sx={{ flex: 1 }} />

          {/* Footer */}
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Avatar
              sx={{
                width: 30,
                height: 30,
                background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DARK} 100%)`,
                fontSize: '0.6875rem',
                fontWeight: 800,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {getInitials(displayName)}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#CBD5E1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}
              >
                {displayName}
              </Typography>
              {roleLabel && (
                <Typography sx={{ fontSize: '0.6875rem', color: '#475569', lineHeight: 1.3 }}>
                  {roleLabel}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
