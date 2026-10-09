import { NavLink } from 'react-router-dom';

import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';

const MECHANIC_NAV: { id: string; label: string; path: string; requiresWorkOrders?: boolean }[] = [
  { id: 'pending', label: 'Pendientes', path: '/mechanic/pending', requiresWorkOrders: true },
  { id: 'mine', label: 'Mis órdenes', path: '/mechanic/mine', requiresWorkOrders: true },
  { id: 'profile', label: 'Perfil', path: '/mechanic/profile' },
];

export function MechanicBottomNav() {
  const { workOrders } = useAppCapabilities();
  const items = MECHANIC_NAV.filter((item) => !item.requiresWorkOrders || workOrders);
  const columns =
    items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <nav
      className={`grid shrink-0 ${columns} border-t border-navy-100 bg-white pb-[max(0.25rem,env(safe-area-inset-bottom))]`}
      aria-label="Navegación mecánico"
    >
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          className={({ isActive }) =>
            `min-h-14 px-2 py-3 text-center text-base font-medium ${
              isActive ? 'text-brand' : 'text-navy-400'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
