# Sprint de integraciones pendientes: WhatsApp, Bold, Wompi, IA de decisiones y facturación electrónica

**Estado: pendiente, a propósito.** Por decisión del dueño (2026-09-28), estas integraciones (WhatsApp, Bold, Wompi, una IA de decisiones y, desde el 2026-10-03, la facturación
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

## 4. IA de decisiones para guiar a las personas (JEV u otra, de código abierto)

**Para qué:** una IA de decisiones que guíe a las personas, por ejemplo a elegir, resolver dudas o seguir el siguiente
paso. La opción propuesta es **JEV** u otra equivalente, preferiblemente **de código abierto**.

**Hoy:**
- El chat del menú («Mi mesero») ya usa un núcleo de conversación compartido ([plan](2026-09-14-chat-menu.md)).
- El asistente de WhatsApp está pendiente (sección 1).
- No hay ninguna IA de decisiones integrada.

**Por definir al empezar el sprint:**
- Qué es exactamente JEV y qué alternativas de código abierto hay.
- A quién guía: comensales, personal del POS o ambos.
- En qué decisiones ayuda.
- Dónde corre (servidor propio o servicio).
- Cómo se conecta al chat del menú y al asistente de WhatsApp.

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

**Alcance del sprint:**
- Elegir el proveedor tecnológico autorizado por la DIAN (por ejemplo Alegra, Siigo, Facture, The Factory HKA o
  Carvajal) o la emisión directa con certificado propio. La recomendación es un proveedor con API: firma, envío y
  validación previa quedan de su lado.
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
