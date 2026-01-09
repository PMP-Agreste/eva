import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { Link as RouterLink } from 'react-router-dom';

import { qAssistidas, listenQuery } from '../services/firestore';
import type { Assistida } from '../types/models';

function mapAssistida(id: string, data: any): Assistida {
  return { id, ...data } as Assistida;
}

export function AssistidasPage() {
  const [items, setItems] = useState<Assistida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = listenQuery(qAssistidas(), mapAssistida, setItems, (e) => setError(e.message));
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((a) => {
      const nome = String(a.nomeCompleto ?? '').toLowerCase();
      const proc = String(a.numeroProcesso ?? '').toLowerCase();
      return nome.includes(s) || proc.includes(s) || a.id.toLowerCase().includes(s);
    });
  }, [items, search]);

  return (
    <Card>
      <CardHeader
        title="Assistidas"
        subheader="orderBy nomeCompleto, limit 200"
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip label={`${filtered.length} registros`} />
            <Button component={RouterLink} to="/assistidas/nova" variant="contained" size="small" startIcon={<AddIcon />}>
              Cadastrar
            </Button>
          </Box>
        }
      />
      <CardContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField label="Buscar (nome, processo, id)" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 320 }} />
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Processo</TableCell>
                <TableCell>ID</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>{a.nomeCompleto ?? <em>—</em>}</TableCell>
                  <TableCell>{a.numeroProcesso ?? <em>—</em>}</TableCell>
                  <TableCell><code>{a.id}</code></TableCell>
                  <TableCell align="right">
                    <Button
                      component={RouterLink}
                      to={`/assistidas/${a.id}/editar`}
                      size="small"
                      startIcon={<EditIcon />}
                      variant="outlined"
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">Nenhum registro encontrado.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}
