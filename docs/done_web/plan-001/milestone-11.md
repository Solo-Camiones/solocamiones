# Milestone 11 — WM11: Catálogos y usuarios (admin)

| Campo          | Valor                                                           |
| -------------- | --------------------------------------------------------------- |
| **ID plan**    | WM11                                                            |
| **Estado**     | Completado                                                      |
| **Fecha**      | 2026-09-01                                                      |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM11 |
| **Alcance**    | Categorías (ensamblaje + componentes esperados), servicios mecánicos, CRUD de usuarios |
| **Siguiente**  | — (plan 001 frontend cerrado) |

---

## 1. Objetivo

Sustituir los placeholders de `/catalogs` y `/users` por pantallas de administrador. Las categorías nuevas alimentan el registro de inventario; un servicio inactivo desaparece del POS; un usuario creado inicia sesión con su contraseña y uno desactivado no.

## 2. Contexto previo

WM10 cerró la app del mecánico. Las categorías y servicios del seed ya existían, pero `MockCategoryRepository.save` y `MockServiceRepository.save` no persistían. `MockUserRepository.save` aceptaba un `User` completo (incluida la contraseña en lecturas). El vendedor ya listaba categorías para filtrar inventario.

## 3. Decisiones clave

### 3.1 Definiciones en servicio, no en la UI

**Decisión:** `prepareCategorySave`, `prepareServiceSave` y `prepareUserSave` validan y normalizan. Los repositorios solo comprueban `catalogs.manage` / `users.manage` y escriben `AppState`.

**Por qué:** Mismo patrón que clientes (WM4). Inventario y POS no duplican reglas: leen el estado compartido.

### 3.2 Lectura de categorías vs mutación

**Decisión:** `CategoryRepository.list` admite `inventory.view` **o** `catalogs.manage`. `save` solo `catalogs.manage`. `ServiceRepository.list` es admin: el POS ya proyecta servicios activos en `buildPosDraftView`.

**Por qué:** El vendedor necesita el selector de categoría al registrar stock (CAT-001) pero no puede redefinir el catálogo. El mecánico no lee el catálogo.

### 3.3 Usuarios sin contraseña en la proyección

**Decisión:** `UserRepository` devuelve `ManagedUser` (`Omit<User, 'password'>`). Alta exige contraseña (mínimo 6, AUTH). Edición sin contraseña conserva la actual. Username único case-insensitive.

**Por qué:** AUTH-003/AUTH-004. La UI de administración no debe filtrar un secreto que el repositorio ya entregó. Desactivar no borra la fila: el login posterior es `FORBIDDEN`. No se puede desactivar la propia sesión ni dejar el sistema sin un administrador activo (cierre del prototipo frente a un lockout).

### 3.4 Catálogo ≠ inventario

Crear o renombrar una categoría no crea piezas. Los ítems existentes siguen apuntando al mismo `categoryId`. Un ensamblaje exige al menos un componente esperado (plantilla de checklist, no identidad física).

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/catalogs.ts
├── api/contracts/users.ts
├── api/client/catalogs-api.ts
├── api/client/users-api.ts
├── mocks/services/catalogs.ts
├── mocks/services/users.ts
├── mocks/repositories/MockCategoryRepository.ts
├── mocks/repositories/MockServiceRepository.ts
├── mocks/repositories/MockUserRepository.ts
├── features/catalogs/
│   ├── CatalogsPage.tsx
│   ├── CategoryList.tsx
│   ├── CategoryFormModal.tsx
│   ├── ServiceList.tsx
│   ├── ServiceFormModal.tsx
│   └── useCatalogs.ts
└── features/users/
    ├── UsersPage.tsx
    ├── UserTable.tsx
    ├── UserFormModal.tsx
    └── useUsers.ts
```

## 5. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Nueva categoría en registro inventario | ✅ `CAT-RIN` aparece en el wizard |
| Servicio inactivo oculto en POS | ✅ `SVC-DIAG` nunca; `SVC-INST` sale al desactivar |
| Usuario creado puede login con su contraseña | ✅ `maria` / `clave123` |
| Usuario desactivado no puede login | ✅ `FORBIDDEN`; reset demo vuelve a 4 seed |
| Listo para swap a API M11 | ✅ stubs HTTP + contratos `Save*Input` |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm test -w @solocamiones/web
```

Resultado: 40 archivos de prueba frontend y 251 pruebas aprobadas.

**Flujos manuales:**

1. Login `admin` / `demo1234` → Catálogos → Nueva categoría ensamblaje → Inventario → Registrar → la categoría está en el selector.
2. Catálogos → Servicios → Desactivar Instalación mecánica → POS borrador → Agregar línea → Servicio: no aparece. Diagnóstico electrónico (seed inactivo) tampoco.
3. Usuarios → Nuevo vendedor con contraseña → logout → login con esas credenciales.
4. Desactivar esa cuenta → login rechazado. Reiniciar datos demo → solo los 4 usuarios seed.
5. Login `laura` → `/users` y `/catalogs` no autorizados; el servicio mock también es `FORBIDDEN`.

No hay herramientas de navegador en esta sesión; la UI se verificó con pruebas de componente (catálogos → wizard, usuarios, POS sin servicio inactivo).

## 7. Fuera de alcance

- Rentabilidad, recuperación y 12 escenarios demo (WM12).
- Stubs `Http*Repository` cableados con `VITE_USE_MOCK_API` (WM12).
- Hash de contraseñas / sesiones HTTP reales (API M11).
- Atributos específicos de neumático/rin más allá de campos libres del registro (CAT-002/003 productivos).

## 8. Handoff a WM12

Catálogos y cuentas admin viven en el mismo `AppState` que inventario, ventas y OT. WM12 debe añadir `/profitability`, `/recovery`, el runner de 12 escenarios (el reset ya restaura solo el seed de 4 usuarios) y el puente `VITE_USE_MOCK_API`.
