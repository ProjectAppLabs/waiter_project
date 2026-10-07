# Sprint de integraciones pendientes: WhatsApp, Bold, Wompi, asistente de IA y facturación electrónica

**Estado: pendiente, a propósito.** Por decisión del dueño (2026-09-28), estas integraciones (WhatsApp, Bold, Wompi, el asistente de IA de atención con su decisor de intención y, desde el 2026-10-03, la facturación
electrónica ante la DIAN) se atacan juntas en un sprint
propio **al final**, después de cerrar el producto del menú y del POS. Hasta entonces, el sistema funciona con los
sustitutos de demostración que se indican abajo, y ningún plan intermedio debe darlas por hechas.

## 1. Autenticación con la API de WhatsApp (Meta WhatsApp Business Platform)

**Para qué:** verificar de verdad la cuenta del comensal con un código enviado por WhatsApp, y servir de base al
**asistente de WhatsApp**, que usará el mismo número, las mismas credenciales y la misma plantilla de mensajes.

**Hoy:**
- La verificación de cuenta es de demostración: cualquier código de 6 dígitos vale, y en producción se rechaza
  (`experience_app/services/account.py`, `require_demo`).
- El puente de pedidos de WhatsApp al POS existe sin Meta ([plan](2026-09-14-whatsapp-pos.md)): no envía ni recibe
  mensajes.

**Por qué urge antes de producción:** los premios de las acciones del [Plan N](2026-09-27-plan-N-promociones.md) y el
descuento de primera compra dependen de una cuenta verificada. Con la verificación de demostración se abusan con cuentas
falsas.

**Alcance del sprint:**
- Número y plantilla de autenticación aprobados en Meta.
- Envío del código de un solo uso, con caducidad, intentos limitados y límite por teléfono y por dispositivo.
- Verificación en el servidor.
- Cada número de Meta vinculado a una sede en el servidor.
- Webhook firmado.
- Secretos cifrados, como los de Wompi.
- Canal de correo como respaldo (la pantalla «cuenta/canal» ya ofrece elegir).
- Después, conectar el asistente a este mismo canal.

## 2. Bold (datáfono y pagos)

**Hoy:**
- El POS cobra con datáfono de forma manual: el datáfono aprueba y el cajero lo confirma.
- La interfaz ya quedó preparada para una semi-integración con Bold (`pos/lib/payments/terminal.ts`, `TerminalAdapter`
  con `name: 'manual' | 'bold'`).
- No hay adaptador Bold ni credenciales.

**Alcance del sprint:**
- Adaptador Bold del datáfono (cobro, estado, anulación).
- Conciliación con el pedido del sistema propio, sin cobros dobles.
- Anulación desde una devolución del POS (plan U): el reembolso con tarjeta se hace en el mismo datáfono.
- Configuración por sede desde el POS, con secretos cifrados.
- Pruebas en su entorno de pruebas.

## 3. Wompi (pagos dentro del menú)

**Hoy:**
- Implementación inicial instalada ([plan](2026-09-14-wompi.md)): configuración en el POS, pantalla de pago del menú,
  adaptador, webhook firmado y conciliación idempotente (hoy con el sistema propio; nació contra Odoo).
- Nunca se probó contra el sandbox real: faltan las cuatro credenciales de pruebas.
- El pago en vivo sigue bloqueado con `PAYMENTS_LIVE_ENABLED=false`.

**Alcance del sprint:**
- Cargar las credenciales de sandbox y validar los cuatro medios: transferencia y QR de Bancolombia, Nequi y tarjeta con
  3DS.
- Publicar la URL del webhook por HTTPS.
- Probar la conciliación con interrupciones.
- Regenerar los secretos de producción expuestos antes.
- Solo después, habilitar producción.
- La acción «pagar en línea» del Plan N empezará a premiar pagos reales cuando esto esté activo.

## 4. Asistente de IA de atención (menú y WhatsApp) con decisor de intención (JEV u otro)

**Para qué:** que un solo asistente atienda en el menú y en WhatsApp, y que un decisor ligero (JEV u otro) clasifique
cada mensaje antes de responder: fuera de tema, pregunta del negocio, menú o pasar a una persona. La investigación de
costos y alternativas está en el documento 230 del gestor documental de ProjectApp (carpeta «Waiter SaaS»).

**Hoy:**
- El chat del menú («Mi mesero») ya usa un núcleo de conversación compartido ([plan](2026-09-14-chat-menu.md)), pensado
  para varios canales; WhatsApp será un canal más de ese núcleo.
- El prompt limita el tema al menú, pero no hay un paso previo que filtre los mensajes ni un banco de preguntas
  frecuentes.

**Alcance del sprint:**
- Interfaz del decisor con dos implementaciones posibles (el modelo actual devolviendo la intención, y JEV o un modelo
  abierto); se elige con una prueba sobre mensajes reales en español.
- Mensajes fuera de tema: respuesta fija, sin modelo conversacional.
- Preguntas del negocio: banco de preguntas frecuentes administrado en el POS, con búsqueda por similitud y respuestas
  aprobadas por el dueño; horario, dirección y teléfono se leen de la sede. Sin coincidencia, no se inventa.
- Menú: el modelo conversacional actual, con sus validaciones contra el catálogo.
- Paso a una persona con aviso en el POS.
- Conexión del mismo asistente al canal de WhatsApp (sección 1).

**Por definir:** si el código abierto es requisito (JEV no lo es) y si el asistente de WhatsApp toma pedidos desde el
inicio.

## 5. Facturación electrónica ante la DIAN

**Para qué:** emitir de verdad las facturas electrónicas, los documentos equivalentes POS y las notas crédito de las
devoluciones, como exige la DIAN a los restaurantes en Colombia.

**Hoy:**
- La app `billing` de experience (plan T4) arma el documento completo: resolución de numeración con prefijo y rango,
  datos de la empresa y del comprador, líneas, impuestos de Colombia (INC o IVA, propina fuera de la base), XML, CUFE y
  QR.
- La emisión pasa por una interfaz de proveedor (`billing/providers/base.py`, `BillingProvider.issue`). Hoy solo existe
  el proveedor simulado (`billing/providers/simulated.py`), que no firma nada y aprueba todo.
- Los estados del documento (pendiente, emitido, rechazado, contingencia) y el reintento ya existen.
- Las notas crédito de las devoluciones (plan U) se arman igual y pasan por el mismo proveedor.

**Decisión (2026-10-03):** microservicio propio en Django, `fiscal/`, aparte de experience. Se descartó comprar
APIDIAN (Factura Latam) por fallas de seguridad en su código y un proveedor en la nube por costo y dependencia. El
detalle está en `docs/planes/2026-10-03-plan-Z-facturacion-propia.md`. **Actualización (2026-10-04):** el microservicio pasó a ser **Fiscal.**, un
repositorio y un servidor propios (`ProjectAppLabs/fiscal_project`); a Waiter le toca conectarse como cliente (fase F6).

**Alcance del sprint:**
- Construir `fiscal` (plan Z): firma, envío a la DIAN y validación previa quedan de nuestro lado.
- Implementar su adaptador detrás de `BillingProvider`: emitir factura, documento equivalente POS y nota crédito;
  consultar el estado; descargar el XML firmado y el PDF.
- Habilitación de cada organización ante la DIAN: set de pruebas, resolución de numeración real, clave técnica y
  certificado o credenciales del proveedor, guardados cifrados como los de Wompi.
- Contingencia: si la DIAN o el proveedor no responden, el documento queda en contingencia y se reenvía solo, sin
  duplicar numeración.
- Envío del documento al correo del comprador.
- Pruebas contra el ambiente de habilitación de la DIAN, no solo con respuestas simuladas.

## Criterio de cierre del sprint

Cada integración:
- se prueba contra el entorno de pruebas real del proveedor, no solo con respuestas simuladas;
- tiene sus secretos fuera del repositorio y cifrados;
- no deja un camino que cobre, verifique o premie dos veces;
- queda documentada en este plan con su evidencia.
