import { Outlet, Navigate, useOutletContext } from 'react-router-dom';

/**
 * Guards admin-only routes. Nested inside AppLayout so it receives the
 * authenticated user + role via outlet context. Waits for the user to load
 * before deciding; non-admins are redirected to the POS.
 */
export default function AdminRoute() {
  const { user, userRole } = useOutletContext();

  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (userRole !== 'admin') {
    return <Navigate to="/pos" replace />;
  }

  // Forward the layout context so admin pages keep receiving the signed-in user
  return <Outlet context={{ user, userRole }} />;
}