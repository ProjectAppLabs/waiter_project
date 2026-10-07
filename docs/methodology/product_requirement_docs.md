# Producto y reglas verificadas

Waiter sirve al personal del restaurante, al dueño, a ProjectApp y al comensal.
El sistema propio de `experience/` reemplazó Odoo y el registro central. El
estado vigente está en el apartado «Estado» del [plan T](../planes/2026-10-01-plan-T-sistema-propio.md)
y en el [README raíz](../../README.md); los traspasos anteriores son historia.

El POS administra salón, pedidos, cocina, caja, inventario, reservas e informes.
También aloja las consolas del dueño y de ProjectApp. El comensal consulta la
carta, comparte carrito y sigue su pedido. Las integraciones externas y el pago
demo deben distinguirse del comportamiento entregado (README, «Próximos pasos»).

Las organizaciones y sedes aíslan datos y permisos. Una persona tiene una sesión
vigente por cuenta. La política de roles decide vistas y operaciones; no basta
con ocultar un botón (`accounts/authentication.py`, `sales/policy.py`).

Para esta ronda, una entrada o salida de efectivo con la misma clave y contenido
debe conservar movimiento, autor, saldo y evento. Cambiar el contenido con la
misma clave se rechaza. Las filas históricas sin clave siguen siendo válidas;
una operación offline ambigua debe quedar para revisión humana.

Pago e Historial deben conservar valores concretos y controles alcanzables en
835×1194, 412×915, 1195×835, 1440×900 y 2560×1440. La ronda no certifica todo el
POS ni el comensal; su mapa está en [USER_FLOW_MAP.md](../USER_FLOW_MAP.md).
