import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

export default function AppLayout() {
  const { user } = useAuth();

  const userRole = user?.role || 'user';

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar userRole={userRole} />
      </div>
      {/* Mobile nav */}
      <div className="md:hidden">
        <MobileNav userRole={userRole} />
      </div>
      {/* Main content */}
      <main className="md:ml-60 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
          <Outlet context={{ user, userRole }} />
        </div>
      </main>
    </div>
  );
}