import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Receipt, Clock, TrendingUp, Users, Store, Bot, Truck, Warehouse, ClipboardList, BarChart2, Tags } from 'lucide-react';
import { cn } from '@/lib/utils';

const adminLinks = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/products', icon: Package, label: 'Products' },
  { path: '/admin/transactions', icon: Receipt, label: 'Sales' },
  { path: '/admin/margins', icon: TrendingUp, label: 'Profit' },
  { path: '/admin/restock', icon: Bot, label: 'Restock' },
  { path: '/admin/wholesale', icon: Warehouse, label: 'Wholesale' },
  { path: '/admin/inventory', icon: Package, label: 'Stock' },
  { path: '/admin/shifts', icon: Clock, label: 'Shifts' },
  { path: '/admin/suppliers', icon: Truck, label: 'Suppliers' },
  { path: '/admin/purchase-orders', icon: ClipboardList, label: 'Orders' },
  { path: '/admin/demand-forecast', icon: BarChart2, label: 'Forecast' },
  { path: '/admin/categories', icon: Tags, label: 'Tags' },
  { path: '/admin/users', icon: Users, label: 'Users' },
];

const cashierLinks = [
  { path: '/pos', icon: ShoppingCart, label: 'Sale' },
  { path: '/pos/retail', icon: Store, label: 'Retail' },
  { path: '/pos/wholesale', icon: Truck, label: 'Wholesale' },
  { path: '/pos/history', icon: Receipt, label: 'Sales' },
  { path: '/pos/shift', icon: Clock, label: 'Shift' },
];

export default function MobileNav({ userRole }) {
  const location = useLocation();
  const links = userRole === 'admin' ? adminLinks : cashierLinks;

  return (
    <>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Store className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">RetailHub</span>
        </div>
      </div>
      <div className="h-14" />

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around z-30 safe-area-bottom overflow-x-auto no-scrollbar">
        {links.map(link => {
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors shrink-0",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <link.icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}