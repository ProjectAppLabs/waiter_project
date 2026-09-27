# Plantillas HTML restringidas por componente: la IA cambia la estructura, no los datos ni los estilos

## Contexto

El Plan J dejó el diseño del menú como datos con esquema: tema por sede, 13 variantes cerradas y una página viva. Su
principio era que la IA nunca escribe HTML ni CSS. Con eso el aspecto global (color, tipografía, densidad, forma) cubre
casi todo el menú, pero la variación de componentes toca 36 de 274 clases y la distribución solo 3 de 25 pantallas. El
dueño quiere más personalización visual por restaurante: rediseñar cada componente, no solo elegir entre variantes.

## Decisión

Cada componente plantillable del [inventario](../inventario/2026-09-25-inventario-menu-comensal.md) puede tener una
plantilla propia por restaurante, escrita en un **lenguaje de plantilla restringido** que se guarda como árbol JSON
validado en el tema v2 (`tema.componentes`). La estructura del menú (pantallas, pasarelas, carrito, cuenta) y los datos
de cada componente siguen siendo del código. Reglas:

1. **Datos enlazados sí o sí.** El contrato de cada componente declara datos obligatorios y opcionales. La validación
   rechaza plantillas a las que les falte un dato obligatorio y dice cuál.
2. **Sin CSS libre.** Solo clases de utilidad `ds-*` derivadas de los tokens del design system. No hay utilidad que baje
   de los mínimos de legibilidad y área táctil de J2.
3. **Acciones como ranuras.** Todo lo interactivo y todo medio (agregar, favorito, pagar, foto, enlace a la ficha) es una
   `<ranura>` que el código llena. Las obligatorias deben aparecer una vez.
4. **Decoraciones solo de la galería.** Imágenes por id, servidas por experience; nunca URLs externas.
5. **Validación en dos tiempos.** Estática al preparar (lista blanca, datos, ranuras, utilidades, límites) y dinámica
   antes de confirmar (medidas de desbordes, solapes y mínimos en navegador).
6. **La carta siempre carga.** Plantilla inválida, ausente o de otra versión del contrato → componente de fábrica.

## Por qué no HTML/CSS libre

Una pantalla que cobra no puede aceptar HTML arbitrario: se podría suplantar el botón de pago, cargar rastreadores o
romper la accesibilidad. Con árbol validado, ranuras y utilidades acotadas, cualquier plantilla es legible, accesible y
segura, y las funciones nuevas del menú siguen sirviendo para todos los restaurantes.

## Consecuencias

- El inventario del design system pasa a v3: componentes con datos y ranuras, además de selectores y variantes.
- El MCP gana `leer_componente`, `preparar_componente` y `verificar_borrador`; el POS enlaza y, más adelante, edita.
- Cada contrato de componente lleva versión; cambiar sus datos o ranuras obliga a revisar las plantillas guardadas.
- El Plan J queda como capa base; el Plan K se apoya en sus borradores, su página viva y su verificador.
