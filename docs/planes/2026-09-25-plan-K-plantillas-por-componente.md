# Plan K: plantillas HTML por componente, con los datos y el design system siempre enlazados

**Objetivo.** Que cada componente del menú del comensal pueda tener una **plantilla propia por restaurante**
(otra estructura HTML), preparada por la IA a través del MCP o por el POS, sin salirse del design system del Plan J y
sin perder ningún dato ni acción del componente. Encima, una **galería de decoraciones** (PNG con movimiento) que las
plantillas pueden insertar.

**Principio, revisado frente al Plan J.** El Plan J prohibía a la IA escribir HTML. El Plan K lo permite en un
**lenguaje de plantilla restringido**: la plantilla decide la estructura y la composición; el código del menú decide qué
datos existen, qué hacen las acciones y cómo se ven los tokens. Detalle en la
[decisión](../decisiones/2026-09-25-plantillas-html-restringidas-por-componente.md). Tres reglas que ninguna plantilla puede romper:

1. **Los datos van enlazados sí o sí.** Cada componente declara sus datos obligatorios; una plantilla que no los muestra
   se rechaza con un error que dice cuál falta.
2. **El estilo solo sale del design system.** Sin CSS, sin `style`, sin colores ni medidas: únicamente clases de utilidad
   `ds-*` que salen de los tokens de J1–J3. Así el tema, la densidad, la forma y el contraste validados siguen mandando.
3. **Las acciones son ranuras del código.** Agregar, favorito, pagar o ir a la ficha se colocan con `<ranura>`; la
   plantilla elige dónde, nunca qué hacen. Nada puede suplantar el botón de pago.

Base: [inventario de pantallas y componentes](../inventario/2026-09-25-inventario-menu-comensal.md) (25 pantallas
reales, ≈70 componentes y piezas).

## Arquitectura

```
contrato del componente (datos, ranuras, utilidades)   ← experience/diseno/componentes.json (fuente de verdad, versionada)
        │
IA/POS: preparar_componente(id, html) ──► validar (lista blanca, datos, ranuras, utilidades, límites) ──► árbol JSON
        │                                                                                              │
        └──► borrador J4 (?borrador=) ──► carta y página viva J5 ──► verificar_borrador (medidas) ──► confirmar_cambio
                                                                                                       │
comensal: tema.componentes[id].arbol ──► Renderizador (React desde el árbol; datos y ranuras del componente real) ──┘
          plantilla inválida o de contrato viejo ──► componente de fábrica (la carta siempre carga)
```

### 1. Lenguaje de plantilla

Un subconjunto de HTML que se guarda **como árbol JSON validado**, nunca como HTML crudo:

- **Etiquetas**: `div span p h1 h2 h3 strong em small ul ol li figure figcaption`.
- **Atributos**: solo `class` con utilidades `ds-*` del catálogo. Sin `style`, `id`, `on*`, `href`, `src`, `data-*`.
- **`<dato nombre="plato.nombre"/>`**: texto de un dato del contrato. Con `formato="precio"` para importes.
- **`<ranura nombre="agregar"/>`**: el código inserta el control o el contenido real (botón de agregar, corazón, foto,
  enlace a la ficha, insignias). Las ranuras obligatorias deben aparecer exactamente una vez.
- **`<si dato="plato.valoracion">…</si>`** y **`<cada dato="lineas" como="linea">…</cada>`**: condicional y repetición
  sobre datos declarados; sin expresiones.
- **`<decoracion id="hoja-3" movimiento="flotar" posicion="arriba-derecha"/>`**: imagen de la galería, con un catálogo
  cerrado de movimientos y posiciones. Solo ids existentes; máximo 3 por componente.
- **Límites**: 150 nodos, profundidad 8, textos fijos de 120 caracteres, sin URLs.

### 2. Utilidades `ds-*` (K1)

Clases generadas a partir de los tokens, todas acotadas, documentadas en `utilidades.json` para que la IA y el validador
usen la misma lista: disposición (`ds-pila`, `ds-fila`, `ds-rejilla-2`, `ds-centro`, `ds-extremos`, `ds-envolver`,
`ds-relativo`, `ds-esquina-<posición>`), espacio (`ds-espacio-{4…32}`, `ds-relleno-{8…24}`), superficies (`ds-fondo`,
`ds-superficie`, `ds-acento`, `ds-acento-suave`, `ds-destacado`, `ds-borde`, `ds-sombra-suave`, `ds-sombra-marcada`),
texto (`ds-texto-{cuerpo,pequeno,subtitulo,titulo,grande}`, `ds-tinta`, `ds-tinta-suave`, `ds-acento-texto`,
`ds-destacado-texto`, `ds-negrita`, `ds-centrado`, `ds-mayusculas`), forma (`ds-radio-{tarjeta,boton,chip,campo,imagen,hoja}`,
`ds-redondo`), tamaño (`ds-ancho-completo`, `ds-foto-{pequena,media,grande}`, `ds-cuadrado`, `ds-4-3`, `ds-recorte`).
No existe utilidad para bajar de 14 px ni de 44 px: los mínimos de J2 se cumplen por construcción.

### 3. Contrato de componente (K1)

`componentes.json` (inventario v3) describe cada componente plantillable con `id`, `nombre`, `pantallas`, `selectores`,
`datos` (`obligatorios` y `opcionales`, con tipo y descripción), `ranuras` (`obligatorias` y `opcionales`), `limites` y
`version`. La plantilla de fábrica de cada componente se escribe en el mismo lenguaje: es el punto de partida que
`leer_componente` entrega a la IA y la prueba de que el lenguaje alcanza para el diseño actual.

### 4. Validación en dos tiempos

- **Estática, al preparar**: parseo a árbol, lista blanca, utilidades, datos y ranuras obligatorias, límites,
  decoraciones existentes. Errores concretos: «falta el dato obligatorio plato.precio», «clase desconocida ds-rojo».
- **Dinámica, antes de confirmar** (K3): `verificar_borrador` abre el borrador en un navegador sin cabeza, mide el
  componente en sus pantallas a 320, 375 y 1024 px y devuelve «la tarjeta desborda 24 px a 320 px», «el precio se solapa
  con la insignia», «el botón queda en 38 px». Reutiliza el verificador de J5. Confirmar exige la última verificación en verde.

### 5. Renderizado seguro (K2)

`diner/components/plantillas/Renderizador.tsx` convierte el árbol en React con una tabla cerrada de etiquetas; los
datos y las ranuras los aporta el componente real (`FoodCard` sigue siendo el dueño de `add`, `favorite` y el enlace).
Sin `innerHTML`. El árbol se lee de `tema.componentes[id]`; si falta, no valida o su `version` no coincide, se usa el JSX de fábrica.

### 6. Galería de decoraciones (K4)

Piezas PNG/WebP por restaurante servidas por experience con id, nunca por URL externa; un paquete de fábrica inicial;
movimientos CSS cerrados (`flotar`, `latir`, `girar`, `deslizar`) que respetan `prefers-reduced-motion`; límites de peso
y tamaño. La subida desde el POS reutiliza la pasarela de administrador y el patrón de la galería del plano de mesas.

## Fases

| Fase | Entrega | Cómo se verifica |
|---|---|---|
| **K1. Contrato** | `componentes.json` v3 con datos, ranuras y plantilla de fábrica de los primeros componentes; `utilidades.json` y `smart-utilities.css`; validador `diseno/plantillas.py` con errores en español; capa `componentes` del tema v2; contrato público ampliado | Pruebas del validador (aceptación, rechazo por cada regla, límites), paridad utilidades ↔ CSS, paridad inventario ↔ código |
| **K2. Renderizado** | `Renderizador` con respaldo al componente de fábrica; tarjeta de plato plantillable; página viva muestra la plantilla | Pruebas de renderizado y respaldo; captura de la tarjeta con la plantilla de fábrica idéntica a la actual; verificador de J5 |
| **K3. MCP** | `leer_componente`, `preparar_componente`, `verificar_borrador`; borrador y página viva con plantillas; POS enlaza | Prueba de punta a punta: la IA lee, prepara, se verifica y confirma; rechazos con errores útiles |
| **K4. Decoraciones** | Galería de fábrica, `<decoracion>`, movimientos, límites; subida desde el POS | Pruebas de la galería; capturas con decoraciones; reduced-motion |
| **K5. Más componentes** | banners, cabecera, cabecera de la ficha, línea del pedido, tarjeta de historial, recibo, tarjeta de estado, recorridos | Una captura por componente con su plantilla de fábrica y una alternativa |

Cada fase se fusiona por separado, sobre J5.

## Decisiones tomadas para arrancar

- **Decoraciones:** de fábrica y subidas desde el POS (las dos). El paquete inicial son las 23 ilustraciones de
  `diner/public/smart-menu/`.
- **Limpieza (K0):** se aplaza. `SmartDemoPay` y `SmartAssistantReminder` son código muerto y los recorridos del
  asistente, preferencias y ayuda son huérfanos; se retiran o reactivan cuando el dueño lo decida. El enlace del chat a
  `ayuda` sigue abriendo la carta.
- **Primer componente:** la tarjeta de plato, la más visible; después el orden de la tabla de K5.

## Fuera de alcance

- Reordenar, ocultar o añadir secciones de una pantalla: la estructura del menú son datos y no se toca.
- CSS libre, JavaScript, iframes, fuentes o imágenes externas.
- Plantillas de los formularios de pago: sus campos y consentimientos los fija la pasarela.

## Riesgos

- **Layouts que nadie probó**: la validación dinámica de K3 y los límites del lenguaje acotan el daño; hasta K3, el
  borrador se revisa a ojo en la carta y en la página viva.
- **Evolución de los componentes de fábrica**: cada contrato lleva `version`; al cambiar los datos o ranuras de un
  componente, las plantillas guardadas con otra versión vuelven al de fábrica y se avisa en la página viva.
- **Rendimiento**: el árbol se valida una vez al guardar y se renderiza sin parseo en el comensal.

## Estado

**K1 hecho (2026-09-25)** en `feat/25092026-plan-k1-contrato-plantillas`, sobre J5.

- `componentes.json` (contrato v3) con la tarjeta de plato: 11 datos, 9 ranuras, un requisito alternativo y su plantilla
  de fábrica en el lenguaje. `utilidades.json` con 58 clases `ds-*` en 7 grupos e implementadas en `smart-utilities.css`
  desde los tokens (prueba de paridad en el comensal). `decoraciones.json` con el paquete de fábrica, movimientos y posiciones.
- `plantillas.py`: parseo a árbol, lista blanca, utilidades, datos y ranuras obligatorias, requisitos, límites,
  decoraciones; 34 rechazos probados con mensaje útil. Capa `componentes` del tema v2 (`null` = fábrica; entrada
  `{version, html}`, guardado `{version, arbol}`); un guardado obsoleto vuelve a fábrica sin tumbar el tema.
- Los borradores de J4 ya la preparan, previsualizan, confirman y restablecen; `vista_previa` la resume. El contrato
  público y `leer_design_system` exponen `plantillas`.
- Pendiente para K2: el renderizador en el comensal y la tarjeta de plato dibujada desde el árbol.
