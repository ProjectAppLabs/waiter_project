# Convenciones y decisiones verificadas

- Una clave se genera antes del primer envío y se persiste hasta obtener
  resultado; regenerarla al sincronizar pierde idempotencia.
- El replay se consulta después de autenticar y filtrar la sede. Una respuesta
  ya confirmada puede recuperarse con caja cerrada; una nueva se rechaza.
- En MySQL las claves necesitan comparación exacta y restricción de unicidad.
  Las filas anteriores conservan NULL, sin inventar identidades históricas.
- La cola sin identidad demostrable conserva la operación para revisión y no
  bloquea un movimiento nuevo independiente del mismo turno.
- Un `max-w-full` dentro de una grilla puede conservar un mínimo intrínseco que
  desborda. Se verifica cada acción y sus ancestros, no sólo `scrollWidth`.
- La revisión responsive empieza por tableta vertical. El flujo de cobro
  incluye el aviso de éxito y la salida hacia Pedidos.
- Comentarios de pruebas, interfaz y commits son en español. Los selectores
  de navegador usan roles y nombres accesibles; los tags declaran flujo y
  resultado. Cada ancho verifica un contrato distinto y explícito.

Fuentes: `sales/api.py`, `sales/models.py`, `pos/lib/offline/outbox.ts`,
`pos/components/payment/PaymentModal.tsx` y el guion responsive de la ronda.
