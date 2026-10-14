# diner — la app del comensal

Frontend del bloque 3. **Solo habla con `experience/`** (`/api/v1/*` por proxy
same-origin); no importa nada de `pos/` ni conoce Odoo ni el registro
(`docs/decisiones/2026-09-05-comensal-app-aparte.md`).

```bash
npm ci && npm run dev            # 192.168.56.10:3001 · EXPERIENCE_ORIGIN=http://192.168.56.10:8001
npm test -- lib components       # unit por lotes
PLAYWRIGHT_BASE_URL=http://192.168.56.10:3001 npx playwright test
```

## Smart Menu (S1)

Un único diseño basado en las 99 pantallas y assets de `exporty-light-mode.zip`.
La UI activa está en `components/smart/`; el POS permite personalizar colores,
tipografía y logo, conservando la composición. Los diseños anteriores permanecen
como código histórico y no se ofrecen en el selector.

Ruta base `/<rest>/<sede>` o `/<rest>/<sede>/t/<token>`; ambas conservan el contexto
al navegar. En desarrollo: <http://192.168.56.10:3001/burger-house/poblado>.

- `/carta`, `/plato/<id>`, `/pedido`, `/estado/<id>`, `/la-cuenta`, `/pago`.
- `/bienvenida`, `/asistente`, `/preferencias`, `/preferencias/actual`, `/ubicacion`.
- `/cuenta`, `/cuenta/registro`, `/cuenta/codigo`, `/cuenta/canal`, `/cuenta/lista`.
- `/cuenta/correo`, `/cuenta/entrar`, `/cuenta/clave`, `/cuenta/recuperar`,
  `/cuenta/restablecer?token=…`, `/cuenta/informacion`, `/cuenta/tarjetas`.
- `/favoritos`, `/historial`, `/recibo/<id>`, `/opinion/<id>`, `/recompensas`,
  `/ayuda`, `/acerca`.

Los ingredientes, nutrición, adicionales, acompañamientos, tiempo de preparación y precio
anterior (tachado en la tarjeta) se editan en **POS → Catálogo → plato → Atributos**. El
saludo de la cabecera se fija en **Configuración → Diseño del menú**. Las fotos y descripciones siguen usando el
catálogo. Los adicionales son productos reales: precios e impuestos del servidor,
disponibilidad y alta atómica del conjunto. Los acompañamientos vacíos explícitos
se conservan; sin selección manual se sugieren hasta tres productos disponibles.
Las valoraciones se agregan desde opiniones de personas que pidieron ese plato.

La cuenta conserva favoritos e historial al cerrar sesión o entrar desde otro
dispositivo con contraseña. Las contraseñas se guardan con hash. La verificación
inicial permanece en modo demo (seis dígitos, cookie de origen, diez minutos);
en producción el registro demo se rechaza. La recuperación requiere configurar
`DINER_EMAIL_ENABLED`, `DINER_PUBLIC_URL` y SMTP en `experience/`.

Las tarjetas son exclusivamente de prueba (Visa 4242…4242, Mastercard 5555…4444,
CVV 123); se guarda únicamente marca/titular/últimos cuatro/vencimiento. Nunca PAN
ni CVV. El checkout anuncia la simulación; los pagos reales se completan en el POS.

## Verificación visual

```bash
node scripts/exporty-audit/capture.cjs
python3 scripts/exporty-audit/report.py
```

Las capturas usan los componentes reales con respuestas API interceptadas. No
crean pedidos ni cuentas en el POS. `AUDIT_CASES` permite repetir casos concretos.
El lector QR se prueba con un SVG generado por el propio script. El informe permite
comparar las 99 referencias con las capturas actuales y revisar los 432 archivos.
Consulta [matriz de comparación](../docs/diseno/exporty/auditoria-exporty.md) y
[decisiones y validación](../docs/decisiones/2026-09-12-smart-menu.md).

Las pruebas `e2e/smart-menu.spec.ts` sí crean una cuenta y una comanda real;
ejecutarlas únicamente en una base demo. Comprueban registro, contraseña,
favoritos, edición de perfil, carrito, cocina, historial, reseñas, cierre y nuevo
acceso, además de responsive y ausencia de escrituras desde vista previa.

### Reseñas y ficha del plato

Las estrellas muestran la media de opiniones reales por plato y sede. Se opina
sobre los platos propios desde el historial del pedido, con los cinco emojis
originales; se puede editar la opinión sin duplicar su valoración.

En el POS: **Catálogo → editar plato → Información** para descripción;
**Atributos** para ingredientes, calorías, peso de porción en gramos y nutrientes.
Todo es opcional: un campo vacío se omite, un cero introducido se conserva.
**Catálogo → Categorías** permite crear y ordenar secciones como «Más populares»
y asignar sus platos; esa selección es manual, no un ranking de ventas.

La revisión del 13 de septiembre ajusta la ficha 51, el checkout 60–63 y la
opinión 67–74. La [comparativa](http://192.168.56.10:3002/#screen-51) incluye
fixtures con nutrición e ingredientes para ver el diseño completo sin cambiar
los datos reales del restaurante.

### Movimiento

El menú lateral y los diálogos tienen entrada/salida suave; las secciones, botones
y favoritos usan movimientos cortos. Se implementa con CSS, sin añadir una librería.
La preferencia del dispositivo de reducir movimiento desactiva estas animaciones.
El asistente sigue siendo el cuestionario actual; el [mesero conversacional](../docs/planes/2026-09-13-mesero-conversacional.md)
es la siguiente etapa propuesta.
