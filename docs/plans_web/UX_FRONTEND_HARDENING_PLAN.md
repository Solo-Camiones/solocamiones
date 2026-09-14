# UX & Frontend Hardening Plan

## Solo Camiones — Web Application

**Objetivo:** mejorar la facilidad de uso, consistencia, accesibilidad y seguridad de interacción del frontend sin alterar las reglas de negocio ya definidas ni rediseñar innecesariamente la aplicación.

**Alcance principal:** `apps/web`

**Tipo de trabajo:** UX hardening / frontend quality improvement

---

# 1. Propósito del plan

El frontend actual tiene una base funcional y conceptual sólida, especialmente en:

- separación de experiencias por rol;
- distinción entre operación comercial y operación física;
- modelado de estados de inventario;
- flujo específico para mecánicos;
- reutilización de componentes UI;
- navegación protegida por roles;
- manejo inicial de estados de carga y error.

Sin embargo, la aplicación todavía conserva algunas características propias de un prototipo y varias áreas pueden generar fricción cuando sea utilizada diariamente por usuarios reales.

El objetivo de este plan **no es rediseñar la aplicación desde cero**.

El objetivo es reducir:

- decisiones innecesarias;
- información visual excesiva;
- errores accidentales;
- inconsistencias de interacción;
- problemas de accesibilidad;
- dependencia de memoria por parte del usuario;
- riesgo de habilitar funcionalidades antes del release correspondiente.

La filosofía general debe ser:

> Mostrar la información correcta, al usuario correcto, en el momento correcto.

---

# 2. Principios que deben respetarse durante todo el trabajo

## 2.1 No modificar reglas de negocio

Las mejoras descritas en este plan son principalmente de:

- UX;
- UI;
- accesibilidad;
- arquitectura frontend;
- navegación;
- prevención de errores;
- presentación de información.

No se deben cambiar reglas del negocio para simplificar la interfaz.

Ejemplos de conceptos que deben seguir siendo independientes cuando el dominio lo requiera:

- vendido ≠ desmontado;
- facturado ≠ pagado;
- reservado ≠ vendido;
- disponible ≠ completo;
- relación física ≠ estado comercial;
- confirmación comercial ≠ ejecución de trabajo físico.

---

## 2.2 Respetar el Development Plan

La existencia de una pantalla en el prototipo **no significa que la funcionalidad esté habilitada en producción**.

Cada release debe continuar respetando el alcance definido en la documentación.

No se deben adelantar funcionalidades únicamente porque el frontend ya tenga una implementación visual.

---

## 2.3 Mantener cambios pequeños y verificables

Cada milestone debe poder implementarse y probarse de forma independiente.

Evitar:

- refactors masivos;
- cambios de arquitectura no relacionados;
- nuevas dependencias sin justificación;
- reescribir componentes que ya funcionan correctamente;
- cambios visuales puramente estéticos que no aporten usabilidad.

---

## 2.4 Reutilizar componentes compartidos

Antes de crear un nuevo componente:

1. buscar si ya existe uno equivalente;
2. extender el existente si la responsabilidad sigue siendo la misma;
3. crear uno nuevo únicamente cuando exista una responsabilidad distinta y reutilizable.

---

# 3. Orden recomendado

| Milestone | Tema                                             | Prioridad |
| --------- | ------------------------------------------------ | --------- |
| UX-0      | Capabilities y separación Prototype/Production   | Crítica   |
| UX-1      | Accesibilidad de componentes base                | Alta      |
| UX-2      | Navegación y arquitectura de información         | Alta      |
| UX-3      | Registro de inventario simplificado              | Alta      |
| UX-4      | Inventario: jerarquía visual e interacción       | Alta      |
| UX-5      | Ventas/POS: prevención de errores y claridad     | Alta      |
| UX-6      | Experiencia del mecánico                         | Media     |
| UX-7      | Responsive y comportamiento en distintos tamaños | Media     |
| UX-8      | Validación final de usabilidad y consistencia    | Alta      |

---

# Milestone UX-0 — Capabilities y separación Prototype / Production

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-0.md`](../done_web/UX_FRONTEND_HARDENING/ux-0.md)

## Problema

El prototipo incluye pantallas y comportamientos correspondientes a diferentes releases.

Esto es correcto para validar el producto completo, pero crea un riesgo importante cuando el mismo código comienza a evolucionar hacia producción.

Actualmente una funcionalidad puede existir visualmente aunque todavía no corresponda al release activo.

Ejemplos:

- venta de artículos de inventario;
- productos por cantidad;
- órdenes de trabajo;
- pagos;
- rentabilidad;
- recuperación;
- controles especiales de demo.

Depender únicamente de que el equipo recuerde qué funcionalidades pertenecen a cada release es frágil.

---

## Cómo afecta

Puede provocar:

- funcionalidades habilitadas antes de tiempo;
- inconsistencias entre frontend y backend;
- pantallas que prometen comportamientos todavía no implementados;
- errores de usuario;
- mayor complejidad al probar releases;
- condiciones dispersas por toda la aplicación;
- dificultad para determinar qué pertenece realmente a producción.

---

## Por qué es importante modificarlo

Este milestone protege directamente el Development Plan.

Además permite que el prototipo siga siendo amplio sin convertir esa amplitud en deuda técnica para producción.

La UI debe depender de capacidades funcionales explícitas, no de conocimiento implícito del equipo.

---

## Solución propuesta

Crear una capa centralizada de **capabilities**.

Ejemplo conceptual:

```ts
type AppCapabilities = {
  inventory: boolean;
  inventorySales: boolean;
  quantitySales: boolean;
  workOrders: boolean;
  payments: boolean;
  profitability: boolean;
  recovery: boolean;
  prototypeControls: boolean;
};
```

Los componentes no deberían preguntar:

```ts
if (release >= 4)
```

Preferir:

```ts
if (capabilities.inventory)
```

Esto desacopla la UI del número de release y representa mejor qué puede hacer realmente el sistema.

---

## Tareas

- [x] Identificar todas las funcionalidades visibles que pertenecen a releases distintos.
- [x] Crear una configuración central de capabilities.
- [x] Documentar qué capability corresponde a cada funcionalidad.
- [x] Aplicar capabilities a la navegación.
- [x] Aplicar capabilities a las rutas.
- [x] Aplicar capabilities a acciones dentro de pantallas.
- [x] Aplicar capabilities a tipos de líneas del POS.
- [x] Separar explícitamente controles de demo/prototipo.
- [x] Evitar condiciones de release duplicadas en múltiples componentes.
- [x] Asegurar que una URL directa tampoco permita acceder a una funcionalidad deshabilitada.
- [x] Añadir pruebas de las combinaciones de capabilities más importantes.

---

## Posibles áreas afectadas

Revisar principalmente:

- router principal;
- `RoleNav`;
- `AppShell`;
- `MechanicLayout`;
- `DemoControls`;
- POS;
- inventario;
- órdenes de trabajo;
- rentabilidad;
- administración y recuperación.

---

## Criterios de aceptación

- Una funcionalidad deshabilitada no aparece en navegación.
- Una funcionalidad deshabilitada no puede abrirse escribiendo su URL manualmente.
- Las acciones internas asociadas tampoco aparecen.
- DemoControls no aparecen en configuración productiva.
- El comportamiento no depende de condiciones duplicadas por componentes.
- Existe una única fuente de verdad para capabilities.
- Las reglas del Development Plan continúan siendo respetadas.

---

## Validación

Probar al menos:

1. configuración mínima de Release 1;
2. configuración con ventas habilitadas;
3. configuración con inventario habilitado;
4. configuración completa de prototipo;
5. acceso directo mediante URL a una capability deshabilitada.

---

# Milestone UX-1 — Accesibilidad de componentes base

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-1.md`](../done_web/UX_FRONTEND_HARDENING/ux-1.md)

## Problema

La aplicación ya utiliza componentes compartidos, pero algunos todavía no implementan completamente patrones de accesibilidad importantes.

El principal caso identificado es `Modal`.

Actualmente existe semántica de diálogo, pero faltan comportamientos habituales como:

- focus trap;
- cerrar con Escape;
- foco inicial;
- devolver el foco al elemento que abrió el modal;
- impedir que el usuario navegue con Tab hacia contenido detrás del diálogo.

También deben revisarse:

- errores de formularios;
- `aria-invalid`;
- `aria-describedby`;
- controles tipo tabs;
- botones pequeños;
- estados de focus visibles.

---

## Cómo afecta

Para usuarios de teclado o tecnologías asistivas puede provocar:

- pérdida de contexto;
- navegación fuera del modal accidentalmente;
- dificultad para saber qué campo contiene un error;
- orden de foco confuso;
- imposibilidad de operar eficientemente sin mouse.

Además, los problemas de accesibilidad suelen revelar problemas generales de interacción que también afectan a usuarios sin discapacidad.

---

## Por qué es importante modificarlo

Los componentes compartidos tienen efecto multiplicador.

Corregir correctamente un `Modal`, `Field` o `Button` mejora automáticamente todas las pantallas que los utilizan.

Por eso este trabajo debe realizarse antes de seguir construyendo muchas interfaces encima de ellos.

---

## Solución propuesta

Fortalecer los primitives de UI existentes.

No crear soluciones manuales complejas si existe una primitive accesible y confiable que encaje con la arquitectura.

Si se evalúa una dependencia como Radix UI o React Aria:

- justificarla;
- usar únicamente la parte necesaria;
- evitar introducir una librería grande sin beneficio claro.

---

## Tareas — Modal

- [x] Mantener `role="dialog"`.
- [x] Mantener `aria-modal="true"`.
- [x] Asociar correctamente el título mediante `aria-labelledby`.
- [x] Implementar cierre con `Escape`.
- [x] Colocar foco inicial dentro del modal.
- [x] Mantener el foco dentro del modal mientras está abierto.
- [x] Devolver el foco al trigger al cerrar.
- [x] Evitar interacción involuntaria con contenido del fondo.
- [x] Revisar cierre mediante backdrop.
- [x] Confirmar que acciones destructivas no se disparan accidentalmente.

---

## Tareas — Field y formularios

- [x] Asociar mensajes de ayuda mediante `aria-describedby`.
- [x] Asociar errores al campo correspondiente.
- [x] Añadir `aria-invalid` cuando corresponda.
- [x] Mantener labels visibles.
- [x] Evitar depender exclusivamente de placeholders.
- [x] Revisar mensajes de validación para que indiquen cómo corregir el problema.
- [x] Revisar formularios largos para que el primer error pueda localizarse fácilmente.

---

## Tareas — TabBar

`TabBar` es **Opción A** (filtros de listado en Ventas y OT). Catálogos usa `Tabs` (**Opción B**).

Determinar si el componente representa:

### Opción A — filtros

Si solamente cambia qué elementos se muestran:

- usar botones;
- comunicar el estado activo;
- evitar roles ARIA de tab innecesarios.

### Opción B — tabs reales

Si representa paneles de contenido:

- implementar `tablist`;
- `tab`;
- `tabpanel`;
- relaciones mediante IDs;
- comportamiento de teclado apropiado.

No mantener una semántica incompleta.

---

## Tareas — controles pequeños

- [x] Revisar botones de icono.
- [x] Revisar botones de cerrar.
- [x] Revisar menús de tres puntos.
- [x] Revisar targets táctiles.
- [x] Garantizar focus visible.
- [x] Añadir `aria-label` cuando el icono no tenga texto visible.

---

## Criterios de aceptación

- Toda operación principal puede realizarse únicamente con teclado.
- Ningún modal permite que Tab escape hacia el fondo.
- Escape cierra modales cuando no existe una razón de negocio para impedirlo.
- Los errores de campos están correctamente asociados.
- El foco visible siempre puede identificarse.
- No existen roles ARIA parciales o incorrectos en `TabBar`.
- Los botones de icono tienen nombre accesible.

---

## Validación

Realizar pruebas manuales:

1. navegar únicamente con `Tab`;
2. `Shift + Tab`;
3. `Enter`;
4. `Space`;
5. `Escape`;
6. abrir y cerrar cada tipo de modal;
7. provocar errores de formularios.

También ejecutar herramientas automáticas de accesibilidad si ya existen en el proyecto o se considera justificable añadirlas.

---

# Milestone UX-2 — Navegación y arquitectura de información

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-2.md`](../done_web/UX_FRONTEND_HARDENING/ux-2.md)

## Problema

El administrador tiene acceso a muchas secciones principales.

Cuando todos los elementos tienen prácticamente el mismo peso visual, el usuario debe escanear una lista larga para encontrar la sección que necesita.

Esto será más evidente a medida que el producto continúe creciendo.

También existe información en el sidebar que no aporta valor directo, como mostrar la cantidad total de secciones.

---

## Cómo afecta

Puede aumentar:

- tiempo para encontrar funciones;
- carga cognitiva;
- errores de navegación;
- sensación de que el sistema es más complejo de lo que realmente es.

Los usuarios frecuentes memorizarán posiciones, pero usuarios nuevos dependerán de leer toda la lista.

---

## Solución propuesta

Agrupar navegación por intención de trabajo.

Ejemplo conceptual:

### Operación

- Dashboard
- Inventario
- Ventas y Facturas
- Clientes
- Órdenes de trabajo

### Administración

- Catálogos
- Usuarios

### Finanzas y control

- Rentabilidad
- Administración y recuperación

Las agrupaciones deben ser discretas.

No convertir la navegación en un árbol complejo.

---

## Tareas

- [x] Revisar navegación de Admin.
- [x] Revisar navegación de Seller.
- [x] Mantener navegación específica del mecánico independiente.
- [x] Introducir agrupaciones visuales si mejoran la escaneabilidad.
- [x] Eliminar información de poco valor como `9 secciones`.
- [x] Mantener `aria-current="page"`.
- [x] Revisar nombres de secciones para que utilicen lenguaje del negocio.
- [x] Evitar duplicar funciones en múltiples zonas del menú.
- [x] Mantener la navegación condicionada por capabilities.

---

## Consideración importante

No añadir submenús únicamente para reducir visualmente la lista.

Un submenú puede esconder funciones y aumentar clicks.

Utilizarlo solo si existe una agrupación real con suficiente contenido.

---

## Criterios de aceptación

- Un administrador nuevo puede identificar rápidamente dónde buscar una funcionalidad.
- No existen elementos de navegación sin utilidad operativa.
- Las funciones de Seller siguen siendo más limitadas que las de Admin.
- Mecánico continúa con experiencia independiente.
- Navegación y rutas respetan capabilities.

---

# Milestone UX-3 — Registro de inventario simplificado

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-3.md`](../done_web/UX_FRONTEND_HARDENING/ux-3.md)

## Problema

La pantalla de registro de inventario puede presentar demasiados campos simultáneamente.

Dependiendo del tipo de pieza o producto por cantidad, el usuario puede enfrentarse a:

- ID;
- nombre;
- categoría;
- marca;
- modelo;
- serial;
- número de parte;
- condición;
- costo;
- procedencia del costo;
- ubicación;
- atributos;
- notas;
- fotos;
- información adicional de ensamblaje.

Aunque todos estos datos puedan ser útiles, no todos son necesarios para completar el acto inicial de recepción.

---

## Cómo afecta

Puede generar:

- percepción de formulario complejo;
- registros más lentos;
- campos completados con datos improvisados;
- abandono de información;
- errores;
- resistencia del usuario a utilizar correctamente el sistema.

Una interfaz que pide demasiada información al principio obliga al usuario a resolver problemas que tal vez todavía no puede resolver.

---

## Por qué es importante modificarlo

La propia documentación del proyecto establece la idea de:

> practical minimum registration + enrichment later.

La UI debe reflejar esa regla.

---

## Solución propuesta

Aplicar **progressive disclosure**.

Dividir la información entre:

### Información necesaria para registrar

Mostrar inmediatamente.

Ejemplo:

- ID;
- nombre;
- categoría;
- condición;
- ubicación.

### Información adicional

Mostrar como sección opcional expandible o secundaria.

Ejemplo:

- marca;
- modelo;
- serial;
- número de parte;
- costo;
- procedencia del costo;
- atributos;
- notas;
- fotos.

La lista definitiva de campos obligatorios debe seguir la documentación funcional.

No cambiar campos requeridos de negocio sin validarlo primero.

---

## Ensamblajes

Cuando exista un flujo de más de un paso, el usuario debe saberlo antes de comenzar.

Ejemplo:

`Paso 1 de 2 — Información del ensamblaje`

`Paso 2 de 2 — Componentes iniciales`

Evitar sorprender al usuario con un segundo paso inesperado después de pulsar Continuar.

---

## Tareas

- [x] Identificar campos realmente obligatorios según documentación.
- [x] Separar campos obligatorios de información enriquecida.
- [x] Introducir progressive disclosure.
- [x] Mantener la posibilidad de completar datos posteriormente.
- [x] Mostrar stepper únicamente cuando exista más de un paso real.
- [x] Mostrar claramente qué campos son opcionales.
- [x] Revisar labels y ejemplos.
- [x] Evitar campos técnicos que el usuario operativo no comprenda.
- [x] Mantener los flujos diferentes para piezas individuales y productos por cantidad.
- [x] Revisar comportamiento de errores.
- [x] Mantener datos ingresados al cambiar entre pasos.
- [x] Pedir confirmación antes de descartar un registro con datos sin guardar.
- [x] Bloquear todas las vías de cierre mientras el registro se está guardando.

---

## Mensaje post-registro recomendado

Después del registro exitoso, comunicar:

- que la pieza o el producto fue registrado;
- qué información quedó pendiente;
- que puede completarse posteriormente;
- acción para ver la pieza o el producto.

Evitar mensajes genéricos como simplemente:

`Guardado correctamente`.

---

## Criterios de aceptación

- El usuario puede completar un registro mínimo sin atravesar campos innecesarios.
- Los campos opcionales siguen disponibles.
- Los ensamblajes indican claramente el número de pasos.
- Cambiar de paso no elimina información introducida.
- Un cierre accidental no descarta información sin confirmación.
- El flujo no cambia reglas de negocio.
- La pantalla inicial se percibe considerablemente menos densa.

---

# Milestone UX-4 — Inventario: jerarquía visual e interacción

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-4.md`](../done_web/UX_FRONTEND_HARDENING/ux-4.md)

## Problema

El modelo de inventario maneja varios estados simultáneos.

Esto es correcto desde el negocio, pero presentar todos los estados como badges con igual peso puede crear ruido visual.

Una fila podría terminar mostrando simultáneamente:

- Disponible;
- Instalado;
- Incompleto;
- Reservado;
- No desarmar.

Además, algunas tablas hacen que toda la fila parezca clicable mediante mouse mientras el elemento realmente accesible con teclado es un enlace interno.

---

## Cómo afecta

Puede provocar:

- dificultad para identificar el dato más importante;
- lectura lenta de tablas;
- exceso de colores;
- inconsistencia entre mouse y teclado;
- mayor esfuerzo para comparar artículos.

---

## Solución propuesta — jerarquía de estados

No eliminar estados.

Clasificarlos por importancia visual.

Ejemplo conceptual:

### Estado principal

`Disponible`

### Contexto físico

`Instalado · Motor Detroit DD15`

### Excepciones importantes

Mostrar como badges destacados:

- RESERVADO;
- INCOMPLETO;
- NO DESARMAR.

La UI debe permitir comprender el estado completo sin convertir cada dato en una alerta visual.

---

## Solución propuesta — filas

Definir una estrategia consistente para todas las tablas.

### Preferencia recomendada

Utilizar un enlace claramente identificable en:

- ID;
- nombre;
- número de documento.

La fila puede tener hover visual, pero no debe simular ser un control si semánticamente no lo es.

Si se decide que toda la fila debe ser interactiva, debe existir comportamiento equivalente con teclado y semántica adecuada.

---

## Tareas

- [x] Inventariar todos los chips/estados existentes.
- [x] Clasificarlos entre estado principal, contexto y excepción.
- [x] Reducir uso innecesario de colores.
- [x] Mantener colores consistentes para un mismo significado.
- [x] Revisar contraste.
- [x] Unificar interacción de tablas.
- [x] Revisar tablas de inventario.
- [x] Revisar tablas de ventas.
- [x] Revisar tablas de usuarios.
- [x] Revisar tablas de órdenes.
- [x] Mantener scroll horizontal cuando sea necesario.
- [x] Revisar qué columnas son realmente necesarias en listado.
- [x] Mover información secundaria al detalle cuando corresponda.

---

## Criterios de aceptación

- El estado principal puede identificarse en menos de un segundo.
- Las excepciones importantes destacan más que el contexto normal.
- No se pierde información del dominio.
- Todas las tablas siguen la misma convención de interacción.
- Mouse y teclado permiten acceder al detalle de forma clara.

---

# Milestone UX-5 — Ventas / POS: prevención de errores y claridad

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-5.md`](../done_web/UX_FRONTEND_HARDENING/ux-5.md)

## Problema

El POS contiene acciones de consecuencias muy diferentes en proximidad:

- agregar línea;
- descartar borrador;
- confirmar venta.

También el prototipo permite tipos de línea correspondientes a funcionalidades que pueden pertenecer a releases futuros.

En procesos de venta, el usuario suele trabajar rápido.

Un error accidental puede tener impacto operativo y financiero.

---

## Cómo afecta

Puede generar:

- descarte accidental;
- confirmación incorrecta;
- venta con tipo de línea no habilitado todavía;
- dificultad para distinguir acción principal de acciones secundarias;
- errores causados por velocidad de operación.

---

## Solución propuesta — jerarquía de acciones

Debe existir una acción principal evidente:

**Confirmar venta**

Acciones secundarias:

- agregar línea;
- guardar cambios si aplica.

Acciones destructivas:

- descartar borrador.

No colocar la acción destructiva con el mismo peso que la acción positiva.

Opciones:

- separación visual;
- zona secundaria;
- menú de acciones;
- confirmación cuando realmente exista riesgo de pérdida de trabajo.

---

## Solución propuesta — tipos de línea

El modal para agregar líneas debe depender de capabilities.

Ejemplo:

Si `inventorySales` es falso:

- no mostrar Pieza.

Si `quantitySales` es falso:

- no mostrar Producto por cantidad.

La UI no debe prometer sincronización o reserva de inventario si el release activo no la soporta.

---

## Tareas

- [x] Reordenar jerarquía de acciones del POS.
- [x] Separar acción destructiva.
- [x] Revisar confirmaciones realmente necesarias.
- [x] Evitar confirmaciones excesivas.
- [x] Aplicar capabilities a tipos de línea.
- [x] Revisar microcopy relacionado con reserva de inventario.
- [x] Revisar estados de loading al confirmar.
- [x] Deshabilitar doble submit.
- [x] Asegurar que el usuario vea claramente subtotal/total.
- [x] Revisar errores de validación.
- [x] Revisar qué ocurre si una línea deja de estar disponible antes de confirmar.
- [x] Mantener borrador hasta que la operación sea confirmada correctamente.

---

## Microcopy

Los mensajes deben utilizar lenguaje operativo.

Preferir:

`La pieza ya no está disponible. Elimínala del borrador o selecciona otra.`

sobre:

`Error 409: conflict`.

---

## Criterios de aceptación

- Confirmar venta es la acción principal evidente.
- Descartar borrador no puede confundirse con confirmar.
- Tipos de línea respetan capabilities.
- No existe doble confirmación por clicks rápidos.
- Los errores indican qué ocurrió y qué debe hacer el vendedor.
- La UI no comunica comportamientos que el backend/release todavía no soporta.

---

# Milestone UX-6 — Experiencia del mecánico

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-6.md`](../done_web/UX_FRONTEND_HARDENING/ux-6.md)

## Situación actual

La experiencia del mecánico es una de las áreas mejor orientadas del frontend.

Está correctamente separada de la interfaz comercial y evita exponer información que no necesita para realizar su trabajo.

Debe preservarse esa simplicidad.

---

## Objetivo del milestone

No rediseñar.

Realizar un hardening orientado al uso real en taller:

- móvil;
- interacción rápida;
- legibilidad;
- targets táctiles;
- fotografías;
- conexión inestable;
- claridad de siguiente acción.

---

## Problemas potenciales a revisar

- botones pequeños;
- textos demasiado densos;
- acciones importantes fuera de viewport;
- pérdida de información si falla una subida;
- falta de feedback durante carga de evidencia;
- navegación innecesaria para completar una tarea.

---

## Tareas

- [x] Revisar tamaño de targets táctiles.
- [x] Revisar legibilidad en teléfonos pequeños.
- [x] Revisar comportamiento con teclado móvil.
- [x] Revisar subida de fotografías.
- [x] Mostrar progreso de subida cuando corresponda.
- [x] Evitar perder fotos/notas por un error recuperable.
- [x] Mantener cliente, factura, precios y datos financieros fuera de la experiencia.
- [x] Asegurar que la acción principal de cada orden sea evidente.
- [x] Revisar estados vacíos.
- [x] Revisar órdenes ya completadas.
- [x] Revisar mensajes de error con conexión intermitente.
- [x] Mantener bottom navigation simple.

---

## Criterios de aceptación

- Un mecánico puede completar su flujo principal con una sola mano en móvil.
- Los targets principales son fáciles de pulsar.
- No necesita interpretar información comercial.
- Un fallo de red no borra silenciosamente trabajo introducido.
- Siempre queda claro cuál es la siguiente acción.

---

# Milestone UX-7 — Responsive y comportamiento en distintos tamaños

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-7.md`](../done_web/UX_FRONTEND_HARDENING/ux-7.md)

## Problema

La interfaz comercial está correctamente orientada a escritorio, pero el sidebar fijo puede consumir demasiado espacio en laptops pequeñas, tablet horizontal o ventanas divididas.

El objetivo no debe ser convertir toda la aplicación Admin/Seller en una aplicación mobile-first.

El objetivo es que siga siendo utilizable cuando el ancho disminuya.

---

## Solución propuesta

Definir tres comportamientos:

### Desktop amplio

Sidebar completo.

### Laptop / tablet horizontal

Sidebar colapsable o compacto.

### Pantalla pequeña

Drawer o navegación equivalente.

Las tablas pueden continuar utilizando scroll horizontal cuando la información realmente lo requiere.

No intentar comprimir todas las columnas hasta volverlas ilegibles.

---

## Tareas

- [x] Probar resoluciones comunes.
- [x] Revisar `w-64` fijo del sidebar.
- [x] Implementar modo compacto si aporta valor.
- [x] Revisar header.
- [x] Revisar POS en laptop.
- [x] Revisar tablas.
- [x] Revisar formularios.
- [x] Revisar modales en viewport bajo.
- [x] Evitar contenido inaccesible por `overflow-hidden`.
- [x] Revisar zoom del navegador al 200%.
- [x] Comprobar que no aparezca scroll horizontal global innecesario.

---

## Resoluciones mínimas sugeridas para probar

- 1920 × 1080
- 1440 × 900
- 1366 × 768
- 1280 × 720
- 1024 × 768

Para mecánico:

- 430 × 932
- 390 × 844
- 360 × 800

---

## Criterios de aceptación

- Admin/Seller siguen siendo utilizables en laptop.
- Sidebar no domina el viewport.
- No existe contenido crítico inaccesible.
- Modales pueden desplazarse correctamente.
- Mecánico mantiene experiencia mobile-first.
- Zoom 200% sigue permitiendo completar operaciones principales.

---

# Milestone UX-8 — Validación final de usabilidad y consistencia

**Registro de implementación:** [`docs/done_web/UX_FRONTEND_HARDENING/ux-8.md`](../done_web/UX_FRONTEND_HARDENING/ux-8.md)

## Problema

Una interfaz puede cumplir criterios técnicos y seguir siendo incómoda para usuarios reales.

Después de los cambios anteriores se necesita una validación enfocada en tareas, no únicamente en componentes.

---

## Objetivo

Confirmar que los flujos principales se sienten:

- claros;
- rápidos;
- predecibles;
- consistentes;
- difíciles de usar incorrectamente.

---

## Escenarios de prueba recomendados

### Administrador

1. Crear un usuario.
2. Cambiar estado o permisos permitidos.
3. Registrar una pieza.
4. Registrar un ensamblaje.
5. Buscar inventario.
6. Revisar rentabilidad cuando la capability esté habilitada.

### Vendedor

1. Buscar cliente.
2. Crear borrador.
3. Añadir una línea.
4. Corregir una línea.
5. Confirmar venta.
6. Buscar factura anterior.

### Mecánico

1. Abrir pendientes.
2. Abrir una orden.
3. Identificar pieza.
4. Revisar ubicación.
5. Adjuntar evidencia.
6. Completar trabajo.

---

## Qué observar

No preguntar únicamente:

> ¿Te gusta?

Observar:

- dónde duda;
- qué intenta pulsar primero;
- qué texto relee;
- qué campo no entiende;
- qué información busca y no encuentra;
- cuándo intenta volver atrás;
- cuándo pregunta qué hacer;
- qué acciones cree que son reversibles;
- qué errores comete.

---

## Métricas simples

Para cada tarea registrar:

- completada / no completada;
- tiempo aproximado;
- errores;
- dudas;
- clicks innecesarios;
- necesidad de ayuda.

No es necesario construir un sistema formal de analytics para esta primera validación.

---

## Checklist de consistencia visual

- [x] mismo tipo de acción = mismo estilo;
- [x] peligro = mismo tratamiento visual;
- [x] mismo estado = mismo color;
- [x] mismos labels para mismo concepto;
- [x] mismas convenciones de tablas;
- [x] mismas convenciones de modales;
- [x] mismos patrones de loading;
- [x] mismos patrones de error;
- [x] mismos estados vacíos;
- [x] mismas convenciones de botones.

---

## Checklist de heurísticas

### Visibilidad del estado

- [x] mostrar loading cuando una operación tarda;
- [x] mostrar resultado de operaciones;
- [x] mostrar pasos en flows multi-step.

### Correspondencia con el mundo real

- [x] utilizar términos del negocio;
- [x] evitar vocabulario técnico de implementación.

### Control y libertad

- [x] permitir cancelar cuando sea seguro;
- [x] mantener acciones destructivas claramente diferenciadas.

### Consistencia

- [x] no utilizar diferentes palabras para el mismo concepto.

### Prevención de errores

- [x] deshabilitar acciones imposibles;
- [x] validar antes de operaciones irreversibles;
- [x] evitar doble submit.

### Reconocimiento sobre memoria

- [x] mostrar contexto necesario;
- [x] no exigir recordar IDs o reglas innecesariamente.

### Flexibilidad

- [x] usuarios frecuentes pueden operar eficientemente sin complicar la experiencia de usuarios nuevos.

### Diseño minimalista

- [x] mostrar información relevante para la tarea actual.

### Recuperación de errores

- [x] mensajes explican problema y solución.

### Ayuda contextual

- [x] agregar explicación solo en procesos que realmente lo necesiten.

---

# 4. Reglas para Cursor / agentes durante estos milestones

Cada implementación debe seguir estas reglas:

1. **No modificar reglas de negocio sin indicación explícita.**
2. **Consultar documentación antes de cambiar flujos.**
3. **Hacer el cambio mínimo necesario.**
4. **No rediseñar pantallas completas si el problema puede resolverse localmente.**
5. **No introducir dependencias sin explicar por qué son necesarias.**
6. **Buscar componentes existentes antes de crear otros.**
7. **Comentar únicamente lógica intermedia o compleja que realmente necesite contexto.**
8. **Mantener separación por roles.**
9. **Mantener compatibilidad con capabilities.**
10. **Verificar teclado y responsive después de cada cambio visual.**

Después de cada ejecución, el agente debe explicar:

### Qué cambió

Archivos modificados y responsabilidad.

### Por qué

Problema UX/técnico que resuelve.

### Cómo se conecta

Qué flujo o componentes dependen del cambio.

### Cómo verificarlo

Pasos manuales, pruebas o comandos.

---

# 5. Qué NO debe incluir este plan

Por ahora evitar:

- rediseño total de branding;
- cambiar colores únicamente por preferencia estética;
- animaciones decorativas;
- sistema complejo de shortcuts;
- personalización avanzada;
- dashboards nuevos sin necesidad real;
- nuevas dependencias de UI sin justificación;
- refactor global del frontend;
- cambios de backend no necesarios para estas mejoras.

---

# 6. Resultado esperado

Al terminar estos milestones, el frontend debería mantener la misma lógica principal pero sentirse:

- más simple;
- más consistente;
- más seguro;
- menos cargado;
- más accesible;
- más fácil de aprender;
- más difícil de utilizar incorrectamente.

El éxito de este trabajo no se mide por cuántos componentes se cambiaron.

Se mide por si un usuario puede completar sus tareas con:

- menos dudas;
- menos errores;
- menos información innecesaria;
- menor dependencia de entrenamiento;
- mayor confianza en lo que ocurrirá al ejecutar una acción.

---

# 7. Orden recomendado de implementación

```text
UX-0  Capabilities y separación Prototype/Production
  ↓
UX-1  Accesibilidad de componentes base
  ↓
UX-2  Navegación
  ↓
UX-3  Registro de inventario
  ↓
UX-4  Inventario y tablas
  ↓
UX-5  Ventas / POS
  ↓
UX-6  Mecánico
  ↓
UX-7  Responsive
  ↓
UX-8  Validación de usabilidad
```

UX-0 y UX-1 deben realizarse temprano porque afectan múltiples pantallas.

UX-8 debe ejecutarse después de que los principales flujos hayan recibido las mejoras anteriores.

---

# 8. Definición de terminado del UX Hardening

El plan completo puede considerarse terminado cuando:

- [x] capabilities controlan correctamente funcionalidades por release;
- [x] PrototypeControls están aislados de producción;
- [x] modales son utilizables completamente con teclado;
- [x] formularios comunican errores de manera accesible;
- [x] navegación es fácil de escanear;
- [x] registro de inventario utiliza progressive disclosure;
- [x] estados de inventario tienen jerarquía visual;
- [x] tablas siguen una interacción consistente;
- [x] POS previene errores comunes;
- [x] mecánico conserva una experiencia simple y mobile-first;
- [x] Admin/Seller funcionan correctamente en laptops;
- [x] los escenarios principales han sido probados manualmente;
- [x] no se alteraron reglas de negocio fuera del alcance;
- [x] la documentación relevante continúa alineada con el comportamiento del frontend.
