import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';

// Fix de ícones padrão do Leaflet no Vite (evita marker “quebrado”)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

(L.Icon.Default as any).mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type PeriodKey = 'hoje' | '7d' | '30d';
type ModeKey = 'visitas' | 'assistidas';

const GUARNICOES = ['Todas', 'PMP Alfa', 'PMP Bravo', 'PMP Charlie', 'PMP Delta'] as const;

type Visita = {
  id: string;
  dataHora?: unknown; // number(ms) ou Timestamp-like
  guarnicao?: string;
  idAssistida?: string;
  houveDescumprimento?: boolean;
  detalhesDescumprimento?: string | null;
  situacaoEncontrada?: string | null;
  observacoesGerais?: string | null;
  latitude?: number;
  longitude?: number;
};

type Assistida = {
  id: string;
  ativa?: boolean;
  nomeCompleto?: string;
  numeroProcesso?: string;
  grauRisco?: string;
  latitude?: number;
  longitude?: number;
};

type Point = {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  popupHtml: string;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;

  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);

  if (typeof v === 'object' && v) {
    const anyV = v as any;
    if (typeof anyV.toDate === 'function') {
      const d = anyV.toDate();
      return d instanceof Date ? d : null;
    }
    if (typeof anyV.seconds === 'number') return new Date(anyV.seconds * 1000);
  }

  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function normalizeGuarnicao(g?: string) {
  return String(g ?? '').trim().toLowerCase();
}

/** Camada de Cluster (MarkerClusterGroup) */
function MarkerClusterLayer({ points, enabled }: { points: Point[]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!points.length) return;

    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
    });

    for (const p of points) {
      const m = L.marker([p.lat, p.lng]);
      m.bindPopup(p.popupHtml, { maxWidth: 360 });
      cluster.addLayer(m);
    }

    map.addLayer(cluster);

    return () => {
      map.removeLayer(cluster);
      try {
        cluster.clearLayers();
      } catch {
        // noop
      }
    };
  }, [map, points, enabled]);

  return null;
}

/** Camada Heatmap (leaflet.heat) */
function HeatLayer({ points, enabled }: { points: Point[]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!points.length) return;

    const heatPoints = points.map((p) => [p.lat, p.lng, p.weight] as [number, number, number]);

    const heat = (L as any).heatLayer(heatPoints, {
      radius: 26,
      blur: 18,
      maxZoom: 17,
    });

    heat.addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points, enabled]);

  return null;
}

/** Ajuste de bounds quando o “token” muda (mudou filtro/dataset/período) */
function FitBounds({ points, token }: { points: Point[]; token: number }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, token, points]);

  return null;
}

export function MapaPage() {
  const [mode, setMode] = useState<ModeKey>('visitas');
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [guarnicao, setGuarnicao] = useState<(typeof GUARNICOES)[number]>('Todas');

  const [showHeat, setShowHeat] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [assistidas, setAssistidas] = useState<Assistida[]>([]);

  const [fitToken, setFitToken] = useState(0);

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    if (period === 'hoje') return { from: today, to: addDays(today, 1) };
    if (period === '7d') return { from: addDays(today, -6), to: addDays(today, 1) };
    return { from: addDays(today, -29), to: addDays(today, 1) };
  }, [period]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      if (mode === 'visitas') {
        const fromMs = range.from.getTime();
        const toMs = range.to.getTime();

        // Busca por período (filtra guarnição em memória para evitar índice composto)
        const qVis = query(
          collection(db, 'visitas'),
          where('dataHora', '>=', fromMs),
          where('dataHora', '<', toMs),
          orderBy('dataHora', 'desc'),
        );

        const snap = await getDocs(qVis);
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Visita[];

        setVisitas(list);
        setAssistidas([]);
      } else {
        const qAs = query(collection(db, 'assistidas'), where('ativa', '==', true));
        const snap = await getDocs(qAs);
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Assistida[];

        setAssistidas(list);
        setVisitas([]);
      }

      setFitToken((x) => x + 1);
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao carregar dados do mapa.');
    } finally {
      setLoading(false);
    }
  }, [mode, range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const points = useMemo<Point[]>(() => {
    if (mode === 'visitas') {
      const gSel = guarnicao !== 'Todas' ? normalizeGuarnicao(guarnicao) : null;

      return visitas
        .filter((v) => {
          const lat = (v as any).latitude;
          const lng = (v as any).longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return false;

          if (gSel) {
            const vg = normalizeGuarnicao(v.guarnicao);
            if (vg !== gSel) return false;
          }
          return true;
        })
        .map((v) => {
          const lat = v.latitude as number;
          const lng = v.longitude as number;
          const dt = toDateSafe(v.dataHora);
          const when = dt ? dt.toLocaleString('pt-BR') : '—';

          const desc = v.houveDescumprimento === true ? 'Sim' : 'Não';
          const weight = v.houveDescumprimento === true ? 1.0 : 0.6;

          const html = `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.25;">
              <div style="font-weight: 800; margin-bottom: 6px;">Visita</div>
              <div><b>Data/Hora:</b> ${escapeHtml(when)}</div>
              <div><b>Guarnição:</b> ${escapeHtml(String(v.guarnicao ?? '—'))}</div>
              <div><b>Assistida:</b> <code>${escapeHtml(String(v.idAssistida ?? '—'))}</code></div>
              <div><b>Situação:</b> ${escapeHtml(String(v.situacaoEncontrada ?? '—'))}</div>
              <div><b>Descumprimento:</b> ${escapeHtml(desc)}</div>
              <div style="margin-top: 8px;">
                <a href="${mapsUrl(lat, lng)}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>
              </div>
            </div>
          `;

          return { id: v.id, lat, lng, weight, popupHtml: html };
        });
    }

    // assistidas
    return assistidas
      .filter((a) => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map((a) => {
        const lat = a.latitude as number;
        const lng = a.longitude as number;

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.25;">
            <div style="font-weight: 800; margin-bottom: 6px;">Assistida</div>
            <div><b>Nome:</b> ${escapeHtml(String(a.nomeCompleto ?? '—'))}</div>
            <div><b>Processo:</b> ${escapeHtml(String(a.numeroProcesso ?? '—'))}</div>
            <div><b>Risco:</b> ${escapeHtml(String(a.grauRisco ?? '—'))}</div>
            <div><b>ID:</b> <code>${escapeHtml(String(a.id))}</code></div>
            <div style="margin-top: 8px;">
              <a href="${mapsUrl(lat, lng)}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>
            </div>
          </div>
        `;

        // peso por risco (opcional): alto = 1.0, médio = 0.8, baixo = 0.6
        const r = String(a.grauRisco ?? '').toLowerCase();
        const weight = r.includes('alto') ? 1.0 : r.includes('méd') || r.includes('medio') ? 0.8 : 0.6;

        return { id: a.id, lat, lng, weight, popupHtml: html };
      });
  }, [mode, visitas, assistidas, guarnicao]);

  const stats = useMemo(() => {
    const total = mode === 'visitas' ? visitas.length : assistidas.length;
    const coords = points.length;
    return { total, coords };
  }, [mode, visitas.length, assistidas.length, points.length]);

  // Centro padrão (Arapiraca/AL aproximado); se tiver pontos, FitBounds resolve.
  const defaultCenter: [number, number] = [-9.7476, -36.6660];

  return (
    <Card>
      <CardHeader
        title="Mapa (Leaflet)"
        subheader={mode === 'visitas' ? 'Visitas (cluster + heatmap)' : 'Assistidas (cluster + heatmap)'}
        action={
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Chip label={`Total: ${stats.total}`} />
            <Chip label={`Com coords: ${stats.coords}`} variant="outlined" />
          </Stack>
        }
      />
      <CardContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Dados</InputLabel>
            <Select label="Dados" value={mode} onChange={(e) => setMode(e.target.value as ModeKey)}>
              <MenuItem value="visitas">Visitas</MenuItem>
              <MenuItem value="assistidas">Assistidas</MenuItem>
            </Select>
          </FormControl>

          {mode === 'visitas' && (
            <>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Período</InputLabel>
                <Select label="Período" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
                  <MenuItem value="hoje">Hoje</MenuItem>
                  <MenuItem value="7d">Últimos 7 dias</MenuItem>
                  <MenuItem value="30d">Últimos 30 dias</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Guarnição</InputLabel>
                <Select
                  label="Guarnição"
                  value={guarnicao}
                  onChange={(e) => setGuarnicao(e.target.value as (typeof GUARNICOES)[number])}
                >
                  {GUARNICOES.map((g) => (
                    <MenuItem key={g} value={g}>{g}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          <FormControlLabel
            control={<Switch checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} />}
            label="Heatmap"
          />

          <FormControlLabel
            control={<Switch checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />}
            label="Marcadores"
          />

          <Chip
            label={mode === 'visitas'
              ? `Filtro: ${period}${guarnicao !== 'Todas' ? ` · ${guarnicao}` : ''}`
              : 'Filtro: assistidas ativas'}
            variant="outlined"
          />
        </Box>

        {points.length === 0 ? (
          <Alert severity="info">
            Nenhum ponto com coordenadas para os filtros atuais. Verifique se há <b>latitude/longitude</b> nos registros.
          </Alert>
        ) : (
          <>
            <Box
              sx={{
                height: '70vh',
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <FitBounds points={points} token={fitToken} />

                <MarkerClusterLayer points={points} enabled={showMarkers} />
                <HeatLayer points={points} enabled={showHeat} />
              </MapContainer>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Cluster agrupa marcadores por proximidade. Heatmap mostra densidade; o “peso” aumenta em descumprimentos (visitas) ou risco alto (assistidas).
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
