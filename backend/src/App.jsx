import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { motion } from 'framer-motion';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <motion.div 
      className="min-h-screen bg-slate-900"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Routes>
        {/* Public routes */}
        <Route 
          path="/" 
          element={
            user ? <Navigate to="/dashboard" replace /> : <LandingPage />
          } 
        />
        <Route 
          path="/login" 
          element={
            user ? <Navigate to="/dashboard" replace /> : <LoginPage />
          } 
        />
        <Route 
          path="/register" 
          element={
            user ? <Navigate to="/dashboard" replace /> : <RegisterPage />
          } 
        />

        {/* Protected routes */}
        <Route 
          path="/dashboard/*" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        {/* Admin routes */}
        <Route 
          path="/admin/*" 
          element={
            <ProtectedRoute adminOnly>
              <AdminPanel />
            </ProtectedRoute>
          } 
        />

        {/* Catch all route */}
        <Route 
          path="*" 
          element={<Navigate to={user ? "/dashboard" : "/"} replace />} 
        />
      </Routes>
    </motion.div>
  );
}

export default App;