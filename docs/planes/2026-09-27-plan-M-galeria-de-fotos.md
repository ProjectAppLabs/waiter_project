# Plan M · Galería de fotos por plato (hasta 5) optimizadas a WebP

**Qué.** Un plato puede tener hasta **5 fotos**: la principal (la de las tarjetas, `product.template.image_1920`) y hasta
**4 de galería**. Toda imagen que se sube se optimiza a **WebP** (máximo 1600 px de lado, calidad 80) al guardarse. La
galería se ve en la ficha del plato como un carrusel.

## Contrato común

1. **Odoo (addon `projectapp_ops`).** Modelo `projectapp.product.photo`: `product_tmpl_id` (m2o a `product.template`,
   obligatorio, `ondelete='cascade'`), `sequence` (int), `image` (`fields.Binary`, `attachment=True`, guarda WebP en base64),
   `width`, `height`, `file_size` (int, bytes del WebP). Restricción: máximo 4 por plantilla. `product.template` gana
   `diner_photo_ids` (o2m, orden `sequence, id`).
   - Optimización `projectapp_ops.utils.images.to_webp(b64, max_side=1600) -> (b64_webp, width, height, size)`: Pillow,
     orientación EXIF corregida, RGBA si hay transparencia (si no, RGB), reduce sin agrandar, WebP calidad 80 `method=6`.
     Rechaza (`UserError`) lo que no sea imagen o pese más de 12 MB antes de optimizar.
   - La foto principal también se optimiza: `create`/`write` de `product.template` convierte `image_1920` a WebP
     (máximo 1600 px) antes de guardar, venga del POS o del backoffice.
   - Método de pasarela `product.template.waiter_set_catalog_photos(template_id, photos, employee_id, employee_token)`
     con la misma autorización que `waiter_save_catalog_product`: `photos` es la lista ordenada final de la galería; cada
     elemento es `{"id": <photo existente>}` o `{"image": "<base64>"}`. Borra las que no vengan, crea las nuevas
     (optimizadas) y fija `sequence` por orden. Más de 4 → `UserError`. Devuelve `[{"id", "width", "height", "size"}]`.
2. **Experience.** `pos.Product.gallery`: lista `[{"id": int, "version": str}]` en el orden de `sequence` (una sola lectura
   de `projectapp.product.photo` para todo el catálogo; `version` = `write_date` compactado como las demás fotos). La carta
   (`menu_view`) añade a cada plato `fotos`: lista de URLs de la galería (sin la principal, que sigue en `foto`), vacía si no
   hay. Endpoint público `GET /api/v1/<rest>/<sede>/fotos/<product_id>/galeria/<photo_id>/?v=<version>` que sirve el WebP
   con las mismas cabeceras seguras e inmutables que la foto principal; 404 si la foto no es de ese plato o sede.
3. **Comensal.** `Dish.fotos?: string[]`. La ficha (cabecera del plato, también dentro de una plantilla propia vía la
   ranura `foto`) muestra `[foto, ...fotos]` como carrusel horizontal con desplazamiento por pasos (`scroll-snap`) y puntos
   con `aria-label` «Foto N de M»; con una sola foto, igual que hoy. Las reglas de imagen del sistema de diseño y el
   verificador aplican a todas (ruta `/fotos/<id>/…`).
4. **POS.** El formulario del plato muestra la foto principal y la galería (miniaturas), permite añadir hasta completar 5,
   quitar y reordenar, y guarda con `waiter_set_catalog_photos` tras `waiter_save_catalog_product`. Solo PNG, JPEG o WebP
   de hasta 12 MB en el navegador; el servidor optimiza.

## Reparto

| Parte | Quién | Archivos |
|---|---|---|
| Odoo: modelo, optimización WebP, pasarela, pruebas | Codex | `odoo/addons/projectapp_ops/**` |
| Experience: galería en el catálogo, endpoint, pruebas | Codex | `experience/experience_app/adapters/odoo/*`, `services/catalog.py`, `views/photos.py`, `urls`, pruebas |
| Comensal: carrusel en la ficha, tipos, verificador | Claude | `diner/**` |
| POS: galería en el formulario del plato | Claude | `pos/**` |
