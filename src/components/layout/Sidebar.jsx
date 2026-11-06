import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, Package, Users, Receipt, 
  Clock, ChevronLeft, ChevronRight, LogOut, TrendingUp, Store, Bot, Truck, ClipboardList, BarChart2, Tags, Warehouse, KeyRound
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const adminLinks = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/products', icon: Package, label: 'Products' },
  { path: '/admin/transactions', icon: Receipt, label: 'Transactions' },
  { path: '/admin/shifts', icon: Clock, label: 'Shifts' },
  { path: '/admin/margins', icon: TrendingUp, label: 'Profit & Margins' },
  { path: '/admin/wholesale', icon: Warehouse, label: 'Wholesale' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/suppliers', icon: Truck, label: 'Suppliers' },
  { path: '/admin/purchase-orders', icon: ClipboardList, label: 'Purchase Orders' },
  { path: '/admin/inventory', icon: Package, label: 'Inventory Manager' },
  { path: '/admin/categories', icon: Tags, label: 'Categories' },
  { path: '/admin/demand-forecast', icon: BarChart2, label: 'Demand Forecast' },
  { path: '/admin/restock', icon: Bot, label: 'Restock Advisor' },
];

const cashierLinks = [
  { path: '/pos', icon: ShoppingCart, label: 'New Sale' },
  { path: '/pos/retail', icon: Store, label: 'Retail Sale' },
  { path: '/pos/wholesale', icon: Truck, label: 'Wholesale Sale' },
  { path: '/pos/history', icon: Receipt, label: 'My Sales' },
  { path: '/pos/shift', icon: Clock, label: 'My Shift' },
];

export default function Sidebar({ userRole }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();
  const links = userRole === 'admin' ? adminLinks : cashierLinks;

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col z-40 transition-all duration-300 border-r border-sidebar-border",
      collapsed ? "w-[68px]" : "w-60"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">RetailHub</h1>
            <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
              {userRole === 'admin' ? 'Admin Panel' : 'Cashier'}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {links.map(link => {
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20" 
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <link.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        {userRole === 'admin' && (
          <Link
            to="/pos"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
          >
            <ShoppingCart className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span>Open POS</span>}
          </Link>
        )}
        <Link
          to="/change-password"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
        >
          <KeyRound className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Change Password</span>}
        </Link>
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent transition-all w-full"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Log Out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}