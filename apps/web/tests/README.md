# Estrategia de pruebas web

La trazabilidad con las reglas de negocio y los límites del alcance actual se documentan en [`docs/TESTING.md`](../../../docs/TESTING.md).

La suite se organiza por el límite que cada prueba cruza, no por el nombre del componente.

## Clasificación

- `unit/`: reglas puras, proyecciones, cálculos y helpers. Usa entorno Node y no comparte estado global.
- `integration/`: repositorios mock, sesión, autorización y persistencia en memoria. Cada prueba reinicia el estado.
- `component/`: comportamiento visible de React, formularios, modales y páginas. Usa jsdom y Testing Library.
- `support/`: builders y configuración reutilizable; no contiene casos de prueba.

## Convenciones

- Nombre: `<unidad>.test.ts` o `<componente>.test.tsx`.
- Estructura Arrange–Act–Assert y nombres que describen comportamiento observable.
- Las reglas de negocio se prueban primero en `unit/`; autorización y mutación compartida, en `integration/`.
- Las pruebas de componentes consultan por rol, etiqueta o texto visible, evitando selectores ligados al CSS.
- Ninguna prueba depende del orden de otra. Las suites con estado llaman `resetMockState()` antes y después.
- jsdom se declara solamente en las pruebas de componentes mediante `@vitest-environment jsdom`.

## Comandos

```bash
npm test -w @solocamiones/web
npm run test:unit -w @solocamiones/web
npm run test:integration -w @solocamiones/web
npm run test:component -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
```
