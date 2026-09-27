# Auditoría visual de Exporty

La revisión humana de **las 99 capturas** está en `docs/diseno/exporty/exporty-review.json`: una observación y una diferencia por imagen, no un porcentaje automático de fidelidad. Los nombres ambiguos del ZIP no se usan para inferir el contenido (90 y 98 son ejemplos).

`capture.cjs` abre los componentes reales de `diner` y captura los escenarios de la matriz a 375 × 812. Intercepta **todas** las peticiones `/api/v1/` con fixtures; una petición sin mapear falla la auditoría. No escribe en Experience/Odoo. Las imágenes de platos proceden del ZIP solo en estas capturas. Las fuentes se verifican y el resultado registra errores JS y desbordamientos.

Con Node 24 y el servidor de diner disponible:

```bash
# Extraer primero el ZIP de confianza a /tmp/smart-export.
EXPORTY_SOURCE=/tmp/smart-export node diner/scripts/exporty-audit/capture.cjs
python3 diner/scripts/exporty-audit/report.py --captures /tmp/exporty-audit/current
python3 -m http.server 3002 --bind 192.168.56.10 --directory test-reports/exporty
```

Chrome se busca en `/usr/bin/google-chrome`; se puede cambiar con `CHROME_PATH`. `DINER_URL`, `EXPORTY_SOURCE` y `EXPORTY_OUTPUT` permiten cambiar servidor, exportación y capturas. `AUDIT_CASES=search,filters` vuelve a capturar solo esos casos conservando el resto de `evidence.json`.

El generador necesita Pillow y valida PNG/XML, rutas del ZIP y hashes. Genera el visor en `test-reports/exporty` (artefacto ignorado por Git), con las 99 imágenes originales, 333 assets gráficos, capturas actuales y resultados JSON. Las imágenes originales no se copian al bundle de producción. El informe verifica las copias originales desplegadas por igualdad SHA-256; un SVG inline o una foto dinámica del catálogo no se cuentan como copia del archivo original.

La inspección humana de assets se hizo con cuatro láminas de 20 PNG y seis láminas de SVG renderizados en Chromium. Las 99 capturas se abrieron en 17 láminas; las vistas largas 44, 45 y 88 se revisaron además individualmente a resolución original.

Con el visor servido, `node diner/scripts/exporty-audit/verify-report.cjs` recorre las 99 referencias y valida imágenes, las comparaciones, filtros, 333 assets y los escenarios capturados y el ancho móvil. Se ejecutó con resultado correcto; también pasaron siete pruebas de componentes, TypeScript y ESLint.

Las referencias 25, 64 y 66 tienen escenarios `location-share`, `checkout-coupon` y `points-earned`. Sus respuestas deterministas sirven para comparar el diseño; la integración real se prueba por separado con Django y el runner de Odoo. Los puntos del fixture no acreditan saldos reales. La captura de pago de prueba mantiene su identificación de demostración.

### Comparar capturas antes/después (Plan J)

Variables extra de `capture.cjs`:

| Variable | Qué hace |
|---|---|
| `CDP_URL` | Usa un navegador ya abierto (p. ej. `http://127.0.0.1:9333`, un Edge de Windows con `--remote-debugging-port`) en lugar de lanzar Chrome. En WSL, Chrome de Linux no tiene sus bibliotecas. |
| `AUDIT_CONTINUE=1` | Si un escenario falla (un paso que ya no existe en la interfaz), lo anota y sigue con el siguiente. |
| `AUDIT_TIMEOUT` | Espera máxima por paso, en ms (5000 acelera los escenarios que fallan; por defecto 30 s). |
| `AUDIT_BOXES=1` | Guarda en `evidence.json` la caja (y, alto, relleno, fuente) de cada elemento, para saber qué regla movió algo. |

Para comparar, captura antes y después con los mismos escenarios. Repite las pantallas con diferencias con el mismo CSS:
lo que también cambia entre dos capturas iguales es ruido (animaciones, reloj), no un cambio del CSS.
