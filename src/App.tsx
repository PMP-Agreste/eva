import { Routes, Route } from 'react-router-dom';
import { RequireGestor } from './auth/guards';
import { AppShell } from './layout/AppShell';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AssistidasPage } from './pages/AssistidasPage';
import { AssistidaFormPage } from './pages/assistidaFormPage';
import { VisitasPage } from './pages/VisitasPage';
import { AgendaPlanejadaPage } from './pages/AgendaPlanejadaPage';
import { PendingActivationPage } from './pages/PendingActivationPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { ProfileNotFoundPage } from './pages/ProfileNotFoundPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pendente" element={<PendingActivationPage />} />
      <Route path="/nao-autorizado" element={<UnauthorizedPage />} />
      <Route path="/perfil-nao-encontrado" element={<ProfileNotFoundPage />} />

      <Route path="/" element={<RequireGestor><AppShell><DashboardPage /></AppShell></RequireGestor>} />

      <Route path="/assistidas" element={<RequireGestor><AppShell><AssistidasPage /></AppShell></RequireGestor>} />
      <Route path="/assistidas/nova" element={<RequireGestor><AppShell><AssistidaFormPage /></AppShell></RequireGestor>} />
      <Route path="/assistidas/:id/editar" element={<RequireGestor><AppShell><AssistidaFormPage /></AppShell></RequireGestor>} />

      <Route path="/agenda" element={<RequireGestor><AppShell><AgendaPlanejadaPage /></AppShell></RequireGestor>} />
      <Route path="/visitas" element={<RequireGestor><AppShell><VisitasPage /></AppShell></RequireGestor>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
