# Ronda de mejora Waiter r4 · 2026-10-09

Base: `main@ed0521a2cc30faa7f7693bb9bd9db47f6030aa11` (después de r3, #26–#29).

Un orquestador coordinó un subagente por frente: seguridad, mantenibilidad, observabilidad, rendimiento, responsividad y QA.
- **Diagnóstico** de solo lectura.
- **Consolidación escéptica**: el orquestador volvió a leer el código citado y repitió las mediciones.
- **Implementación** solo de lo aprobado, en ramas `improve/<frente>-09102026-r4` con un dueño por archivo.
- **Umbral**: impacto ALTO, o impacto MEDIO con esfuerzo y riesgo BAJOS.

Decisiones del operador:
- **Sin tope global de 3**: se aprueba todo lo que supere el umbral después de la revisión del orquestador.
- **Regresiones fuera del cupo**: de las que mantenibilidad dejó fuera de sus 3 propuestas, entran todas las que pasan el umbral.
- **Agotados**: el encargado los ve en sus restaurantes, sin precios.
- **Toolkit**: no se hace push. Este registro reemplaza al ledger canónico para r4; el de `vps-ops-toolkit` queda sin r4.

Entorno:
- MySQL 8.4.11 privado en loopback, con bases TEST exclusivas por frente y zonas horarias cargadas.
- Node 24.20.0 y npm 11.19.0, con dependencias propias de la ronda.
- Waiter no figura en `projects.yml` ni está desplegado en este host.

## Diagnóstico

| Frente | Estado | Lo que se encontró |
|---|---|---|
| Seguridad | VALE LA PENA | Pillow 12.1.1 se colgaba al abrir un EPS (CVE-2026-59203) antes de la lista blanca. Es un DoS de CPU entre inquilinos y quedó reproducido. Dependencias certificadas para `ed0521a`: los demás advisories no tienen un camino alcanzable. |
| Mantenibilidad | VALE LA PENA | El contrato entre POS y servidor se tradujo a mano en la migración de Odoo al sistema propio, y nada lo ata. Quedaron regresiones vivas en flujos principales. |
| Observabilidad | VALE LA PENA | El cron de suscripciones envía correo dentro de la transacción que bloquea todas las organizaciones (3,17 s contra 0,012 s). Las fotos de celular se rechazan con un 400 en HTML. El correo de producción va a archivo. |
| Rendimiento | VALE LA PENA | Inicio carga 84 días de pedidos completos (201 MB por petición en el techo de 10.000 pedidos). Ventas pide 4 veces el resumen. La cocina hace 2 lecturas por refresco y carga los terminados completos. |
| Responsividad | VALE LA PENA | Cocina, Inventario y Operación están rotos en tableta vertical (835) y en celular (412), con captura vigente. |
| QA | VALE LA PENA | El CI corría 23 de los 209 archivos de Jest: #23 y #29 dejaron 3 suites en rojo con el CI en verde. Aislamiento y permisos quedaban fuera del CI. |

## Cambios

| PR | Frente | Qué cambió |
|---|---|---|
| [#31](https://github.com/ProjectAppLabs/waiter_project/pull/31) | seguridad | Imágenes no raster rechazadas antes de abrirlas; agotados visibles para el encargado sin precios; el mesero sin caja no termina en «Abrir caja» y el 403 se muestra. |
| [#32](https://github.com/ProjectAppLabs/waiter_project/pull/32) | mantenibilidad | Cobro con datáfono, QR y propina; se retira el «Forzar cierre» falso; invitar personal; política de roles leída antes de guardar; juntar mesas en reservas; «Agregar piso»; Ventas con una sola lectura por periodo (P2 de rendimiento); contrato vigente en `paymentKit.test.ts` (P1b de QA). |
| [#33](https://github.com/ProjectAppLabs/waiter_project/pull/33) | rendimiento | Inicio sin cargar el pedido completo (200,9 → 41,1 MB en el techo); cocina con 1 lectura por refresco (terminados de 198,9 a 5,2 MB); fecha del documento en la zona de la organización; MRR con la tarifa que se cobra y ventas netas de devoluciones. |
| [#34](https://github.com/ProjectAppLabs/waiter_project/pull/34) | observabilidad | Cron de suscripciones en dos fases; fotos reducidas en el POS y 413 JSON en el servidor; POS que abre con el Salón apagado; mensajes de error reales en el comensal. |
| [#35](https://github.com/ProjectAppLabs/waiter_project/pull/35) | responsividad | Cocina, Inventario → Menú y Operación usables en 835 y 412 (rojo 9/9 → verde 9/9 en vivo); crear, editar y borrar ingredientes quedan para el dueño, como en el servidor. |
| [#36](https://github.com/ProjectAppLabs/waiter_project/pull/36) | QA | Ubicación del restaurante como número; consola de plataforma (`whatsapp: null`, vigencia con zona, alta y ficha del cliente para quien opera); franjas de reserva que se pueden reservar; registro de los flujos E2E de r4. |
| este PR | compartido | Doble del diálogo nativo en `jest.setup`; correo de producción que falla cerrado y respeta TLS implícito (P3 de observabilidad); Pillow 12.3.0; carpetas y testMatch de las e2e nuevas; Jest completo y matrices de permisos en el tren; aislamiento y suspensión en cada PR; `NEW_TESTS` y regresiones de r4; este registro. |

## Pendientes de rondas anteriores

| ID | Decisión r4 | Evidencia |
|---|---|---|
| I-O-552be2d4b20c | Cerrado: cubierto por I-O-55e68a9c1775 | `pos/lib/offline/outbox.ts:131-146`; `offline.test.ts:31` |
| I-O-f73b95682945 | Cerrado: cubierto por I-O-01c477d24afb | `pos/lib/services/core/http.ts:48-62`; el comensal tiene 15 s desde 2026-09-05 |
| I-O-b9be73a034d6 | Diferido hasta «Wompi real»: hoy el camino es inalcanzable | `online_payments.py:38,169`; `payment_settings.py:76` |
| I-P-cc121e139b61 | Descartado: dentro del presupuesto (6/6/6 consultas; 37 MB en el techo) | medición r4 |
| I-P-a04a34001fed | Descartado: beneficio menor (3 consultas constantes) | medición r4 |
| I-P-1f9eff3a4817 | Descartado: impacto BAJO, esfuerzo BAJO, riesgo MEDIO | medición r4 |
| I-P-3547f7d06383 | Sigue descartado (175 MB en el techo; es una acción poco frecuente) | medición r4 |
| «Equipo repite lecturas por persona» | Sigue diferido (5/16/54 consultas; pantalla de configuración) | medición r4 |
| I-R-62207f50c4a8 | Aplicado en r4 (Operación, #35) | captura r4 |
| I-R-6031fa2affaa | No se reproduce a 835; es mayor solo a 412 → diferido | captura r4 |
| I-R-23052aa818a5 | Falso positivo: `smart-menu.css:1756` fija 16 px y gana por especificidad | medición en Chromium |
| NAV del Dashboard a 412 | Mayor, no bloqueante; diferido junto con la decisión sobre el POS en celular | captura r4 |

## Descartes de r4

No se reevalúan salvo que cambie la condición indicada.

### Seguridad
- **Next.js 16.3.3** (RCE de `next/og`, SSRF, cache poisoning): no hay camino. No se usa `next/og`, las imágenes son `unoptimized` y no hay `remotePatterns` ni SSG/ISR. Se reabre si alguno de esos aparece.
- **sharp < 0.35.5**: es una dependencia opcional que no se usa. Se reabre si se activa el optimizador de imágenes.
- **urllib3 2.7.0**: no hay streaming de respuestas no confiables. Se reabre si se hace streaming desde terceros.
- **cryptography 46.0.5**: solo se usa Fernet. Se reabre si se usan PKCS7 o X.509.
- **Django 6.1.1 (GeoDjango)**: `contrib.gis` no está instalado.
- **pip 24.0** y **source-map-js**: son herramientas de entorno o de build, sin uso en runtime.
- **Fuerza bruta en el login del POS** (impacto MEDIO, esfuerzo MEDIO): PBKDF2 con 1,5 M de iteraciones tarda unos 6,5 s por intento. Se reabre si baja el costo del hash o aparece un intento real.
- **Falta de tope al cuerpo JSON**: refutado; `DATA_UPLOAD_MAX_MEMORY_SIZE` sí lo limita.
- **24 handlers de escritura**: todos delegan su autorización; no hay hallazgo.

### Mantenibilidad
Todos estos tienen impacto MEDIO y esfuerzo o riesgo MEDIO, salvo donde dice BAJO, así que no pasan el umbral:
- El pedido del comensal cancelado sigue «Pendiente de pago». Se reabre con el pago real del comensal.
- El ROI cuenta filas con un tope de 1000. Se reabre si hay un agregado en el servidor.
- El carrito congela el precio: es diseño de producto.
- «Reservada» y el «hoy» del navegador: sin reproducir.
- Redondeo de centavos y vista previa de puntos: impacto BAJO, con guarda existente.
- La capa `call_kw` que emula Odoo: impacto BAJO, esfuerzo ALTO.
- `requirements.in` desfasado, PostgreSQL en `pos/README.md`, scripts de `diner/package.json` y ruta del reporte de r2 en `playwright.ronda.config.ts`: impacto BAJO.
- Tipos de latitud y longitud como `number | null`: impacto BAJO.

### Observabilidad
Todos tienen impacto BAJO:
- un 503 del comensal sin causa;
- avisos de cobro que solo se intentan el día exacto;
- no hay identificador de petición;
- el pago simulado registra ids (no corre en producción);
- el verificador de diseño vuelca su stderr;
- `generate_charges` bloquea organizaciones (es mensual y sin I/O externo);
- el plazo de 15 s: contrastado y sin operación legítima que lo supere;
- el límite de 10 MB que anuncia `FloorInfoForm.tsx`;
- el texto «hasta 12 MB» de `catalog/images.py`.

### Rendimiento
- **Operación refresca 3 veces los pedidos cada 10 s** (impacto MEDIO, esfuerzo MEDIO).
- **Rentabilidad carga las líneas del periodo** (impacto MEDIO, esfuerzo MEDIO; 98,6 MB en el techo).
- **Totales constantes de 9–16 consultas** (impacto BAJO).
- **`event()` borra eventos viejos en cada escritura** (impacto BAJO).
- **Bundles y tareas programadas**: sin hallazgo (263 KB gz iniciales como máximo).

### Responsividad
- **NAV principal a 835 y 412** (impacto, esfuerzo y riesgo MEDIO): va con la decisión sobre el POS en celular.
- Impacto BAJO:
  - la fila de Administración a 412;
  - el cierre del Modal de 40×40;
  - las entradas de 14–15 px;
  - los objetivos de menos de 44 px;
  - el ranking de Ventas truncado a 835.
- **«Domicilio» en pedidos para llevar** (Operación): es contenido, fuera del frente.

### QA
- **Suite completa del backend en el CI** (impacto BAJO).
- **CI del comensal** (impacto BAJO): se reabre cuando una ronda toque `diner/`.
- **ESLint completo del POS en el CI** (impacto BAJO): sus 8 errores son previos.
- **E2E de negativos, roles, tarjeta/QR y consolas** (impacto MEDIO, esfuerzo ALTO).
- **Specs legados sin tags** (impacto BAJO).
- **Pruebas duplicadas** (impacto BAJO): le corresponden a `test-audit`.
- **Mutation testing** (impacto BAJO, esfuerzo ALTO).
- **Las 12 advertencias del gate** (impacto BAJO).

## Riesgos y decisiones abiertas

- **POS en celular (412 px)**: hay 8 módulos con acciones o datos inaccesibles: Salón, Cerrar caja, Nueva reserva, Configuración, KPI de Ventas, entre otros. Es una decisión de producto: restringir el POS a tableta o más (extendiendo el estándar) o hacer rondas por módulo, empezando por Salón y Cerrar caja.
- **Capacidad del SSE**: cada pantalla retiene un hilo de gunicorn hasta 300 s. Con 16 flujos abiertos, un worker de 16 hilos deja de responder (medido), y el despliegue preparado tiene 3×16 hilos. Hay que decidirlo antes del primer despliegue: servidor de eventos asíncrono, servicio aparte o un presupuesto de pantallas.
- **Sigue abierto desde r3**: un cobro antiguo sin coincidencia inequívoca queda en revisión manual.
- **Residuales de r4**:
  - la auditoría del aviso de cobro no es atómica con su marca;
  - la reducción de fotos no está cubierta por jsdom;
  - el tope de puntos al reabrir un cobro que ya tiene propina;
  - un piso vacío si falla el `PUT` de su plano;
  - la vigencia de módulos usa la zona horaria del navegador;
  - la duración por omisión de 1,5 h está escrita en varios lugares;
  - no hay E2E que pague con QR.
- **Auditoría de flujos previa a r4**: `organization-console-navigation` y `pos-payment-member-benefit` están como «missing», y `pos-orders-review` como «suspect».
- **Ledger canónico del toolkit**: queda sin r4 por decisión del operador.

## Verificación

- **Por rama**: lo hizo el orquestador sobre el SHA de cada rama.
  - El diff contiene solo archivos aprobados.
  - Las pruebas nuevas están en rojo con el código base y en verde con el cambio.
  - Typecheck y eslint de lo cambiado en 0, y `falla_si` en 0.
  - Ruff no tiene avisos nuevos.
  - La puerta estricta da 99–100.
- **Integración local de las 7 ramas (`3213055`)**: Jest completo del POS, 216 suites y 1007 pruebas en verde, incluidas las 3 que estaban en rojo en main.
<!-- verificación combinada: backend completo y E2E en vivo -->
