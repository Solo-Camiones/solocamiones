import { createBrowserRouter } from 'react-router-dom';

import { LoginPage } from './features/auth/LoginPage';
import { CustomersPage } from './features/customers/CustomersPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { InventoryDetailPage } from './features/inventory/InventoryDetailPage';
import { InvoiceDetailPage } from './features/sales/InvoiceDetailPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { MechanicHomeRedirect } from './features/mechanic/MechanicHomeRedirect';
import { MechanicLayout } from './features/mechanic/MechanicLayout';
import { MechanicMinePage } from './features/mechanic/MechanicMinePage';
import { MechanicOrderView } from './features/mechanic/MechanicOrderView';
import { MechanicPendingPage } from './features/mechanic/MechanicPendingPage';
import { CatalogsPage } from './features/catalogs/CatalogsPage';
import { UsersPage } from './features/users/UsersPage';
import { ReceivablesPage } from './features/receivables/ReceivablesPage';
import { ProfitabilityPage } from './features/profitability/ProfitabilityPage';
import { AdminRecoveryPage } from './features/admin-recovery/AdminRecoveryPage';
import { NotFoundPage } from './features/placeholder/NotFoundPage';
import { PosPage } from './features/sales/PosPage';
import { SalesPage } from './features/sales/SalesPage';
import { WorkOrderDetailPage } from './features/work-orders/WorkOrderDetailPage';
import { WorkOrdersPage } from './features/work-orders/WorkOrdersPage';
import { AppShell } from './shared/layout/AppShell';
import { CatchAllRoute } from './shared/layout/CatchAllRoute';
import { DesktopHomeRedirect } from './shared/layout/DesktopHomeRedirect';
import { GuestRoute } from './shared/layout/GuestRoute';
import { MechanicRouteGuard } from './shared/layout/MechanicRouteGuard';
import { ProtectedRoute } from './shared/layout/ProtectedRoute';
import { RouteAccessGuard } from './shared/layout/RouteAccessGuard';

const desktopChildRoutes = [
  {
    path: '/dashboard',
    element: <DashboardPage />,
  },
  {
    path: '/inventory',
    element: <InventoryPage />,
  },
  {
    path: '/inventory/:id',
    element: <InventoryDetailPage />,
  },
  {
    path: '/sales',
    element: <SalesPage />,
  },
  {
    path: '/sales/draft/:id',
    element: <PosPage />,
  },
  {
    path: '/sales/:id',
    element: <InvoiceDetailPage />,
  },
  {
    path: '/customers',
    element: <CustomersPage />,
  },
  {
    path: '/receivables',
    element: <ReceivablesPage />,
  },
  {
    path: '/work-orders',
    element: <WorkOrdersPage />,
  },
  {
    path: '/work-orders/:id',
    element: <WorkOrderDetailPage />,
  },
  {
    path: '/catalogs',
    element: <CatalogsPage />,
  },
  {
    path: '/users',
    element: <UsersPage />,
  },
  {
    path: '/profitability',
    element: <ProfitabilityPage />,
  },
  {
    path: '/recovery',
    element: <AdminRecoveryPage />,
  },
  {
    path: '/profile',
    element: <ProfilePage />,
  },
];

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: '/mechanic',
    element: (
      <ProtectedRoute roles={['MECHANIC']}>
        <MechanicLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <MechanicHomeRedirect /> },
      {
        element: <MechanicRouteGuard />,
        children: [
          { path: 'pending', element: <MechanicPendingPage /> },
          { path: 'mine', element: <MechanicMinePage /> },
          { path: 'orders/:id', element: <MechanicOrderView /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  {
    element: (
      <ProtectedRoute roles={['ADMINISTRATOR', 'SELLER']}>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DesktopHomeRedirect /> },
      {
        element: <RouteAccessGuard />,
        children: [...desktopChildRoutes, { path: '*', element: <NotFoundPage /> }],
      },
    ],
  },
  {
    path: '*',
    element: <CatchAllRoute />,
  },
]);
