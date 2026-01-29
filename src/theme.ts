import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#F48FB1' },
    secondary: { main: '#90CAF9' },
    background: { default: '#0B1020', paper: '#101A2C' },
    divider: 'rgba(255,255,255,0.10)',
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: ['Inter','system-ui','-apple-system','Segoe UI','Roboto','Arial','sans-serif'].join(','),
    h5: { fontWeight: 800 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { border: '1px solid rgba(255,255,255,0.06)', backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' } } },
  },
});
