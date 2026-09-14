import { useEffect, useState } from 'react';
import {
  customerRepository,
  inventoryRepository,
  salesRepository,
  userRepository,
  workOrderRepository,
} from '../../api/repositories';
import { APP_NAME } from '../../shared/config/brand';
import { AppLayout } from '../../shared/layout/AppLayout';
import {
  Button,
  Card,
  Chip,
  Info,
  Mono,
  money,
  SectionTitle,
  useToast,
} from '../../shared/ui';

type SeedSummary = {
  users: number;
  items: number;
  qtyProducts: number;
  customers: number;
  invoices: number;
  workOrders: number;
};

async function loadSeedSummary(): Promise<SeedSummary> {
  const [users, items, qtyProducts, customers, invoices, workOrders] = await Promise.all([
    userRepository.list(),
    inventoryRepository.listItems(),
    inventoryRepository.listQtyProducts(),
    customerRepository.list(),
    salesRepository.listInvoices(),
    workOrderRepository.list(),
  ]);

  if (
    !users.ok ||
    !items.ok ||
    !qtyProducts.ok ||
    !customers.ok ||
    !invoices.ok ||
    !workOrders.ok
  ) {
    throw new Error('No se pudo cargar el seed mock');
  }

  return {
    users: users.value.total,
    items: items.value.length,
    qtyProducts: qtyProducts.value.length,
    customers: customers.value.length,
    invoices: invoices.value.total,
    workOrders: workOrders.value.length,
  };
}

/** WM1 verification placeholder — no business screens yet. */
export function FoundationPage() {
  const { pushToast } = useToast();
  const [summary, setSummary] = useState<SeedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeedSummary()
      .then(setSummary)
      .catch((loadError: unknown) => {
        const message =
          loadError instanceof Error ? loadError.message : 'Error desconocido al cargar seed';
        setError(message);
      });
  }, []);

  return (
    <AppLayout activeNav="dashboard">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-navy">WM1 — Fundación</h1>
        <p className="mt-2 max-w-2xl text-navy-400">
          Layout Opción C: sidebar oscuro + contenido claro. Pantallas de negocio en WM2+.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Design system" subtitle={`Tokens ${APP_NAME} + componentes base`} />
          <div className="flex flex-wrap gap-2">
            <Chip tone="brand">Marca</Chip>
            <Chip tone="amber">Advertencia</Chip>
            <Chip tone="success">Disponible</Chip>
            <Chip tone="danger">Vendido</Chip>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-brand" title="brand" />
            <span className="h-8 w-8 rounded-lg bg-brand-dark" title="brand-dark" />
            <span className="h-8 w-8 rounded-lg bg-brand-light" title="brand-light" />
            <span className="h-8 w-8 rounded-lg bg-shell" title="shell" />
            <span className="h-8 w-8 rounded-lg bg-navy" title="navy" />
            <span className="h-8 w-8 rounded-lg border border-navy-200 bg-surface" title="surface" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button>Primario</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <p className="mt-4 text-sm text-navy-400">
            Moneda: <Mono>{money(125_000)}</Mono> · ID: <Mono>MOT-001</Mono>
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            onClick={() => pushToast('Toast de verificación', 'success')}
          >
            Probar toast
          </Button>
        </Card>

        <Card>
          <SectionTitle title="Seed mock" subtitle="Cargado vía repositorios (no import directo)" />
          {error && (
            <Info tone="error" title="Error">
              {error}
            </Info>
          )}
          {!error && !summary && <p className="text-sm text-navy-400">Cargando datos…</p>}
          {summary && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(summary).map(([key, count]) => (
                <div key={key} className="rounded-lg bg-navy-50 px-3 py-2">
                  <dt className="text-navy-400">{key}</dt>
                  <dd className="text-lg font-semibold text-navy">{count}</dd>
                </div>
              ))}
            </dl>
          )}
          <Info tone="info" title="Arquitectura mock → API">
            Los features consumen interfaces de repositorio. El swap a HTTP ocurre en WM12 con{' '}
            <Mono>VITE_USE_MOCK_API</Mono>.
          </Info>
        </Card>
      </div>
    </AppLayout>
  );
}
