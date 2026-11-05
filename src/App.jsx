import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Layout
import AppLayout from '@/components/layout/AppLayout';

// Admin pages
import Dashboard from '@/pages/admin/Dashboard';
import Products from '@/pages/admin/Products';
import Transactions from '@/pages/admin/Transactions';
import Shifts from '@/pages/admin/Shifts';
import Margins from '@/pages/admin/Margins';
import UserManagement from '@/pages/admin/UserManagement';
import RestockAdvisor from '@/pages/admin/RestockAdvisor';
import Suppliers from '@/pages/admin/Suppliers';
import PurchaseOrders from '@/pages/admin/PurchaseOrders';
import DemandForecast from '@/pages/admin/DemandForecast';
import InventoryManager from '@/pages/admin/InventoryManager';
import Categories from '@/pages/admin/Categories';
import WholesaleDashboard from '@/pages/admin/WholesaleDashboard';

// POS pages
import SaleTypeChooser from '@/pages/pos/SaleTypeChooser';
import PointOfSale from '@/pages/pos/PointOfSale';
import WholesaleSale from '@/pages/pos/WholesaleSale';
import SalesHistory from '@/pages/pos/SalesHistory';
import MyShift from '@/pages/pos/MyShift';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected app routes — unauthenticated users redirect to /login */}
            <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/pos" replace />} />

                {/* Admin routes — admin only */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<Dashboard />} />
                  <Route path="/admin/products" element={<Products />} />
                  <Route path="/admin/transactions" element={<Transactions />} />
                  <Route path="/admin/shifts" element={<Shifts />} />
                  <Route path="/admin/margins" element={<Margins />} />
                  <Route path="/admin/wholesale" element={<WholesaleDashboard />} />
                  <Route path="/admin/users" element={<UserManagement />} />
                  <Route path="/admin/restock" element={<RestockAdvisor />} />
                  <Route path="/admin/suppliers" element={<Suppliers />} />
                  <Route path="/admin/purchase-orders" element={<PurchaseOrders />} />
                  <Route path="/admin/demand-forecast" element={<DemandForecast />} />
                  <Route path="/admin/inventory" element={<InventoryManager />} />
                  <Route path="/admin/categories" element={<Categories />} />
                </Route>

                {/* POS routes */}
                <Route path="/pos" element={<SaleTypeChooser />} />
                <Route path="/pos/retail" element={<PointOfSale />} />
                <Route path="/pos/wholesale" element={<WholesaleSale />} />
                <Route path="/pos/history" element={<SalesHistory />} />
                <Route path="/pos/shift" element={<MyShift />} />
              </Route>
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App