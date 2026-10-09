# Milestone 3 — WM3: Dashboard operativo

| Campo          | Valor                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **ID plan**    | WM3                                                                    |
| **Estado**     | Completado                                                             |
| **Fecha**      | 2026-08-28                                                             |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM3      |
| **Alcance**    | Panel resumen por rol: KPIs, facturas recientes, timeline de actividad |
| **Siguiente**  | WM4 — Clientes                                                         |

---

## 1. Objetivo

Sustituir el placeholder de `/dashboard` por un panel operativo que agregue el seed mock. Admin y Vendedor ven las mismas métricas de operación; **utilidad DOP** y **FX pendiente** solo salen en la proyección de Administrador.

---

## 2. Contexto previo

WM2 dejó `/dashboard` como `PlaceholderPage`, repositorios de listado sin agregaciones, y sesión + shell por rol. El handoff pedía `features/dashboard/`, `KpiCard`, facturas recientes, timeline y agregaciones en servicios mock.

---

## 3. Decisiones clave

### 3.1 Agregaciones en servicios puros, no en la UI

**Decisión:** `buildDashboardSnapshot(state, options)` concentra inventario disponible, facturas del día, saldo, borradores, OT, ensamblajes incompletos, utilidad y FX. La página solo pinta el snapshot.

**Por qué:** El plan prohíbe reglas de negocio en componentes. WM7/WM12 reutilizan `invoice-money.ts` y `gross-profit.ts` en lugar de recalcular ITBIS o margen en React.

### 3.2 Reloj demo fijo (`DEMO_NOW_ISO`)

**Decisión:** “Facturas hoy” usa `2026-08-25T16:00:00.000Z`, no el reloj de la máquina.

**Por qué:** El criterio de aceptación exige números estables tras reiniciar el seed. Con la fecha real (p. ej. 28 ago 2026) el KPI quedaría en 0 aunque el dataset no cambie.

### 3.3 Proyección por rol en el repositorio

**Decisión:** `MockDashboardRepository.getSnapshot()` exige `dashboard.view`. Si `can(user, 'profit.view')` es falso, el snapshot **omite** `profitDop` y `pendingFx` (no los pone en 0).

**Por qué:** Ocultar en UI no basta (endurecimiento vs Make). El Vendedor no recibe campos de rentabilidad en el payload.

### 3.4 Saldo y utilidad

- **Saldo:** suma de balances de facturas `COMPLETED` que no están `PAID`, **sin convertir** USD↔DOP (COST/PAY: los montos operativos no se cruzan). El KPI principal es DOP; USD se muestra como pista si hubiera saldo.
- **FAC-000096** está `PAID` sin filas de pago: el balance computado respeta `paymentState` para no inflar CxC.
- **Utilidad DOP:** precio final menos costo DOP conocido. FAC-000097 (línea genérica sin costo) se **excluye**; costo desconocido no es cero (COST-003).
- **ITBIS:** el total de factura es la suma de precios finales. El 18 % incluido solo se deriva si `fiscal: true` (`lineItbis`), listo para WM7.

### 3.5 Inventario disponible

Suma de ítems `AVAILABLE` (8) más unidades de cantidad `onHand − reserved` (46 + 24) = **78**. Las piezas reservadas siguen contando como inventario disponible comercialmente.

---

## 4. Estructura añadida / modificada

```
apps/web/
├── src/
│   ├── api/contracts/dashboard.ts
│   ├── api/client/dashboard-api.ts
│   ├── mocks/
│   │   ├── data/demo-clock.ts
│   │   ├── services/invoice-money.ts
│   │   ├── services/gross-profit.ts
│   │   ├── services/dashboard-snapshot.ts
│   │   └── repositories/MockDashboardRepository.ts
│   ├── shared/layout/KpiCard.tsx
│   └── features/dashboard/
│       ├── DashboardPage.tsx
│       ├── useDashboard.ts
│       ├── RecentInvoicesList.tsx
│       └── ActivityTimeline.tsx
└── tests/
│   ├── unit/mocks/services/dashboard-snapshot.test.ts
│   ├── integration/mocks/repositories/dashboard.repository.test.ts
│   └── component/dashboard/DashboardPage.test.tsx
```

**Modificados:** `policies.ts` (`dashboard.view`), `repositories.ts`, `router.tsx`, `vite.config.ts`, `package.json` (Vitest).

---

## 5. Números esperados tras reinicio (reloj 2026-08-25)

| KPI                     | Admin                         | Vendedor                |
| ----------------------- | ----------------------------- | ----------------------- |
| Inventario disponible   | 78                            | 78                      |
| Facturas hoy            | 2 (FAC-000098, FAC-000099)    | 2                       |
| Saldo pendiente DOP     | RD$23,100.00 (19,500 + 3,600) | igual                   |
| 4.ª tarjeta fila 1      | Utilidad DOP RD$8,900.00      | Borradores: 1           |
| Desarmes pendientes     | 1                             | 1                       |
| OT en proceso           | 1                             | 1                       |
| Ensamblajes incompletos | 2 (CAM-001, MOT-002)          | 2                       |
| FX pendiente            | 1                             | no se envía ni se pinta |

Clic en una factura reciente → `/sales/:id` (detalle aún placeholder WM7).

---

## 6. Criterios de aceptación

| Criterio                                 | Estado                                            |
| ---------------------------------------- | ------------------------------------------------- |
| KPIs distintos Admin vs Vendedor         | ✅ 4.ª KPI + FX                                   |
| Números coinciden con seed tras reinicio | ✅ cubierto por tests de `buildDashboardSnapshot` |
| Clic en factura navega a detalle         | ✅ `Link` a `/sales/${id}`                        |

---

## 7. Verificación

```bash
cd apps/web
npm test
npm run typecheck
npm run build
npm run dev
```

**Flujos manuales:**

1. Login `admin` / `demo1234` → Dashboard con utilidad DOP y FX pendiente
2. Logout; login `laura` / `demo1234` → 4.ª KPI es Borradores; no aparece utilidad ni FX
3. Clic en FAC-000099 → `/sales/INV-099`
4. Reiniciar datos demo, volver a entrar → mismos números

---

## 8. Fuera de alcance (WM3)

| Tema                                  | Milestone |
| ------------------------------------- | --------- |
| Detalle de factura, pagos, PDF        | WM7       |
| POS / confirmar venta (cambia KPIs)   | WM8       |
| Toggle FX y reintento de rentabilidad | WM12      |
| CRUD clientes                         | WM4       |

---

## 9. Handoff a WM4

Listo para implementar `features/customers/` sobre `MockCustomerRepository`. El dashboard ya navega a `/sales/:id`; el detalle puede esperar a WM7.

---

## 10. Referencias

- [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM3
- [`docs/done_web/plan-001/milestone-2.md`](./milestone-2.md)
- [`docs/FEATURES/11_COST_AND_PROFITABILITY.md`](../../FEATURES/11_COST_AND_PROFITABILITY.md) COST-003
- [`docs/PROTOTYPE_PLAN.md`](../../PROTOTYPE_PLAN.md) § 5 Dashboard
