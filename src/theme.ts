import { createTheme, alpha } from '@mui/material/styles';

const ROSE = '#F472B6';
const ROSE_DARK = '#EC4899';
const BLUE = '#60A5FA';
const BG_DEFAULT = '#080E1C';
const BG_PAPER = '#0F1729';
const BG_ELEVATED = '#162035';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: ROSE,
      dark: ROSE_DARK,
      light: '#FBCFE8',
      contrastText: '#0F0A0D',
    },
    secondary: {
      main: BLUE,
      light: '#BAD9FD',
      dark: '#3B82F6',
      contrastText: '#0A1020',
    },
    success: { main: '#34D399', light: '#6EE7B7', dark: '#059669' },
    warning: { main: '#FBBF24', light: '#FDE68A', dark: '#D97706' },
    error: { main: '#F87171', light: '#FCA5A5', dark: '#DC2626' },
    background: {
      default: BG_DEFAULT,
      paper: BG_PAPER,
    },
    divider: 'rgba(255,255,255,0.07)',
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      disabled: '#475569',
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: ["'DM Sans'", 'system-ui', '-apple-system', 'sans-serif'].join(','),
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 800, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem', letterSpacing: '0.01em' },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
    overline: {
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 700,
      fontSize: '0.6875rem',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: BG_DEFAULT,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.12) transparent',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.07)',
          backgroundColor: BG_PAPER,
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        },
        elevation2: {
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: BG_PAPER,
          border: '1px solid rgba(255,255,255,0.07)',
          transition: 'border-color 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(255,255,255,0.12)',
          },
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { paddingBottom: 8 },
        title: {
          fontWeight: 700,
          fontSize: '0.9375rem',
          letterSpacing: '-0.01em',
        },
        subheader: {
          fontSize: '0.75rem',
          marginTop: 2,
          color: '#64748B',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          '&:last-child': { paddingBottom: 16 },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: alpha(BG_DEFAULT, 0.92),
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: BG_DEFAULT,
          borderRight: '1px solid rgba(255,255,255,0.07)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '7px 16px',
          fontSize: '0.8125rem',
        },
        contained: {
          background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DARK} 100%)`,
          boxShadow: `0 0 20px ${alpha(ROSE, 0.25)}`,
          '&:hover': {
            background: `linear-gradient(135deg, ${ROSE_DARK} 0%, #BE185D 100%)`,
            boxShadow: `0 0 28px ${alpha(ROSE, 0.35)}`,
          },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.15)',
          '&:hover': {
            borderColor: 'rgba(255,255,255,0.3)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 12px',
          transition: 'all 0.15s ease',
          '&.Mui-selected': {
            background: `linear-gradient(135deg, ${alpha(ROSE, 0.18)} 0%, ${alpha(ROSE_DARK, 0.10)} 100%)`,
            borderLeft: `2px solid ${ROSE}`,
            paddingLeft: 10,
            '& .MuiListItemIcon-root': {
              color: ROSE,
            },
            '& .MuiListItemText-primary': {
              color: ROSE,
              fontWeight: 700,
            },
            '&:hover': {
              background: `linear-gradient(135deg, ${alpha(ROSE, 0.22)} 0%, ${alpha(ROSE_DARK, 0.14)} 100%)`,
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#64748B',
          minWidth: 36,
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#CBD5E1',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: '7px !important',
          border: '1px solid rgba(255,255,255,0.12) !important',
          color: '#94A3B8',
          fontWeight: 600,
          fontSize: '0.75rem',
          padding: '5px 12px',
          '&.Mui-selected': {
            backgroundColor: alpha(ROSE, 0.18),
            color: ROSE,
            '&:hover': {
              backgroundColor: alpha(ROSE, 0.24),
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          gap: 4,
          backgroundColor: 'transparent',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.75rem',
          height: 24,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.03)',
            '& fieldset': {
              borderColor: 'rgba(255,255,255,0.12)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255,255,255,0.22)',
            },
            '&.Mui-focused fieldset': {
              borderColor: ROSE,
              boxShadow: `0 0 0 3px ${alpha(ROSE, 0.15)}`,
            },
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255,255,255,0.07)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontSize: '0.8125rem',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: BG_ELEVATED,
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.75rem',
          borderRadius: 8,
          padding: '6px 10px',
        },
      },
    },
  },
});
