import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './App.css'

import LandingPage    from './pages/LandingPage'
import LoginPage      from './pages/LoginPage'
import Dashboard      from './pages/Dashboard'
import FichePerso     from './pages/FichePerso'
import RecapGlobal    from './pages/RecapGlobal'
import Stock          from './pages/Stock'
import Tricount       from './pages/Tricount'
import Blanchiment    from './pages/Blanchiment'
import Administration from './pages/Administration'
import FicheMembre    from './pages/FicheMembre'
import Calendrier     from './pages/Calendrier'
import VentesGroupe   from './pages/VentesGroupe'
import Layout         from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

function AppLayout({ children, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Tous membres connectés */}
        <Route path="/dashboard"   element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/fiche"       element={<AppLayout><FichePerso /></AppLayout>} />
        <Route path="/calendrier"  element={<AppLayout><Calendrier /></AppLayout>} />

        {/* Responsable + Direction */}
        <Route path="/recap-global" element={
          <AppLayout roles={['responsable','direction']}>
            <RecapGlobal />
          </AppLayout>
        } />

        {/* Responsable + Direction */}
        <Route path="/stock" element={
          <AppLayout roles={['responsable','direction']}><Stock /></AppLayout>
        } />
        <Route path="/ventes-groupe" element={
          <AppLayout roles={['responsable','direction']}><VentesGroupe /></AppLayout>
        } />

        {/* Direction uniquement */}
        <Route path="/tricount" element={
          <AppLayout roles={['direction']}><Tricount /></AppLayout>
        } />
        <Route path="/blanchiment" element={
          <AppLayout roles={['direction']}><Blanchiment /></AppLayout>
        } />
        <Route path="/admin" element={
          <AppLayout roles={['direction']}><Administration /></AppLayout>
        } />
        <Route path="/fiche-membre" element={
          <AppLayout roles={['direction']}><FicheMembre /></AppLayout>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}