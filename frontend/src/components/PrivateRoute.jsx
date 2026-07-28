import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function PrivateRoute({ children, requiredRole }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <Navigate to="/unauthorized" />;
  }

  return children;
}
