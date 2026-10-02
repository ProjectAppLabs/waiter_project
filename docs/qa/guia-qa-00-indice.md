# Guía QA Waiter — 0. Índice, lineamientos y datos de prueba

**Producto:** Waiter · ProjectApp
**Fecha de actualización:** 2 de octubre de 2026
**Estado de la entrega:** POS, consola del dueño, cocina, menú del comensal y consola de ProjectApp en desarrollo continuo. Esta guía es un documento vivo: cada plan que se termina añade o corrige casos.
**Ambiente:** desarrollo compartido (ver «Direcciones»). Nada de lo que se haga aquí toca dinero real ni a clientes reales.

## 1. Cómo está organizada la guía

La guía se divide por **rol** y, dentro de cada rol, por **funcionalidad**. Cada caso tiene un código, el objetivo, quién lo ejecuta, los datos, los pasos y el resultado esperado. Al final de cada guía hay una tabla para registrar el resultado.

| Guía | Rol o área | Casos |
|---|---|---|
| 1 | Acceso e identidad (todos los roles) | A-01 … A-10 |
| 2 | Mesero | M-01 … M-09 |
| 3 | Cajero | C-01 … C-08 |
| 4 | Cocina (vista KDS) | K-01 … K-06 |
| 5 | Encargado | E-01 … E-13 |
| 6 | Dueño (consola de la organización) | D-01 … D-15 |
| 7 | Comensal (menú por QR) | Co-01 … Co-09 |
| 8 | ProjectApp (consola de la plataforma) | P-01 … P-08 |

**Roles del restaurante.** Son cuatro: **Dueño**, **Encargado**, **Cajero** y **Mesero**. Cocina no es un rol: es una vista (KDS) que por defecto solo tiene el encargado y que el dueño puede dar a meseros o cajeros desde la matriz de permisos. Dentro del POS el dueño trabaja como encargado; la consola de la organización es solo del dueño.

**Dos organizaciones de prueba, dos motores.** Waiter está migrando de Odoo a un sistema propio. Hoy conviven:

| Organización | Dirección | Motor | Qué se prueba allí |
|---|---|---|---|
| Burger House | `http://localhost:3000` | Odoo | Todo el POS, la cocina, la consola completa y el menú del comensal |
| Frisby 74312 | `http://frisby-74312.localhost:3000` | Sistema propio | Inicio de sesión, Restaurantes, Equipo, Catálogo e Inventario. Lo demás llega con las fases T2 a T5 |

Cuando un caso diga «solo Burger House», no lo ejecute en Frisby: no está construido allí todavía y el resultado no sería un hallazgo.

## 2. Direcciones y usuarios de prueba

| Usuario | Contraseña | Rol | Dónde entra |
|---|---|---|---|
| `admin` | `admin` | Dueño de Burger House | `http://localhost:3000/login` → consola `/organizacion` |
| `laura.encargada` | `waiter-demo-2026` | Encargada de Poblado (Burger House) | `http://localhost:3000/login` |
| `carlos.cajero` | `waiter-demo-2026` | Cajero de Poblado | `http://localhost:3000/login` |
| `sofia.mesera` | `waiter-demo-2026` | Mesera de Poblado | `http://localhost:3000/login` |
| `mateo.mesero` | `waiter-demo-2026` | Mesero de Laureles, con turno (sirve para «fuera de horario») | `http://localhost:3000/login` |
| `maria.lopez` | `Frisby-2026!` | Dueña de Frisby (sistema propio) | `http://frisby-74312.localhost:3000/login` → `/organizacion` |
| `ana.projectapp` | `Plataforma-2026` | Administradora de ProjectApp | `http://localhost:3000/plataforma/login` |

Otras direcciones:

- Menú del comensal: `http://localhost:3001/burger-house/poblado`. Con el QR de una mesa la dirección termina en `/t/<token>`.
- Cocina (KDS): `http://localhost:3000/kds`, con un usuario que tenga la vista Cocina.
- Los correos que manda el sistema propio (invitaciones y códigos) se guardan como archivos; el equipo de ProjectApp los entrega al probador cuando un caso lo pide.

Datos de demostración de Burger House: restaurantes **Poblado** y **Laureles** (Laureles con 6 mesas), tolerancia de caja de $ 2.000, un cierre de Poblado con faltante de $ 12.000, recetas de «Papas Trufadas» y «Bowl de salmón», y unos 20 platos sin receta (sirven para las pruebas de Rentabilidad).

## 3. Cómo ejecutar y registrar

1. Ejecute los casos en el orden de cada guía: varios dependen del anterior (por ejemplo, un pedido creado por la mesera lo cobra el cajero).
2. Use el usuario que indica el caso. Si un caso pide dos roles, abra dos navegadores o una ventana privada.
3. Registre el resultado en la tabla final de cada guía: **Aprobado**, **Fallido** o **Bloqueado** (no se pudo ejecutar por un fallo anterior).
4. Un caso **Fallido** lleva siempre: qué hizo, qué esperaba, qué pasó, captura de pantalla y hora. Si hubo un mensaje de error, cópielo textual.
5. Las **observaciones** que no son fallos (textos confusos, pasos de más, algo lento) se anotan aparte: también nos sirven.
6. No corrija datos a mano en el sistema para «hacer pasar» un caso. Si el dato de prueba falta, repórtelo como Bloqueado.

## 4. Fuera de alcance por ahora

No pruebe todavía, porque no están construidos o están simulados a propósito:

- Pagos reales con pasarela (Wompi, Bold, Bre-B). En el POS, el QR es simulado y la tarjeta se registra a mano con «Aprobado» o «Rechazado». En el menú del comensal el pago en línea es simulado.
- Factura electrónica ante la DIAN.
- WhatsApp (pedidos y asistente) y tarjetas NFC.
- El mesero virtual con IA del menú: existe un chat de recomendaciones, pero su contenido no se valida en esta guía.
- En Frisby (sistema propio): salón, pedidos, caja, reservas, informes y menú del comensal. Llegan con T2 a T5 y tendrán sus casos entonces.

## 5. Glosario

- **Organización:** el cliente de ProjectApp (una marca con uno o varios restaurantes).
- **Restaurante o sede:** cada local, con su propia caja, mesas e inventario.
- **Turno de caja:** periodo entre «Abrir caja» y «Cerrar caja» en un restaurante.
- **Curso:** tanda de platos que va junta a cocina («Nueva ronda» crea un curso nuevo).
- **Agotar aquí:** marcar un plato como no disponible solo en un restaurante.
- **Matriz de permisos:** la tabla «Qué puede hacer cada rol» de Consola → Equipo.
- **Ventana de acceso:** el horario del turno más un margen de minutos del restaurante; fuera de ella, meseros y cajeros no entran.
