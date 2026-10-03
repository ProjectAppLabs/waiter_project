"""Permisos compartidos por las rutas de operación."""

from tenancy.http import require

VIEWS = [
    "dashboard",
    "tables",
    "orders",
    "reservations",
    "history",
    "inventory",
    "kitchen",
    "sales",
    "customers",
    "billing",
]
ACTIONS = ["create_orders", "charge_orders", "serve_orders", "edit_inventory", "refund_orders"]


def default_role_policy():
    return {
        "waiter": {"views": ["tables"], "actions": ["create_orders", "serve_orders"]},
        "cashier": {"views": ["orders"], "actions": ["create_orders", "charge_orders"]},
        "admin": {"views": list(VIEWS), "actions": list(ACTIONS)},
    }


VIEW_MODULES = {key: 'nucleo' for key in VIEWS} | {
    'tables': 'salon', 'kitchen': 'cocina', 'inventory': 'inventario',
    'billing': 'facturacion', 'customers': 'fidelizacion', 'reservations': 'reservas',
}
ACTION_MODULES = {key: 'nucleo' for key in ACTIONS} | {'edit_inventory': 'inventario', 'serve_orders': 'salon'}


def module_restaurant(account):
    if hasattr(account, '_module_restaurant'):
        return account._module_restaurant
    if account.role in ('waiter', 'cashier'):
        return account.restaurants.first()
    return None


def can(account, permission):
    from tenancy.modules import is_active
    module = VIEW_MODULES.get(permission, ACTION_MODULES.get(permission, 'nucleo'))
    if not is_active(account.organization, module, module_restaurant(account)):
        return False
    policy = account.organization.role_policy.get(account.role, {})
    return account.role in ("owner", "admin") or permission in policy.get("views", []) + policy.get("actions", [])


def permit(account, *permissions):
    from tenancy.modules import is_active, require_module
    if not any(is_active(account.organization, VIEW_MODULES.get(p, ACTION_MODULES.get(p, 'nucleo')),
                         module_restaurant(account)) for p in permissions):
        require_module(account.organization, VIEW_MODULES.get(permissions[0], ACTION_MODULES.get(permissions[0], 'nucleo')),
                       module_restaurant(account))
    require(any(can(account, p) for p in permissions))


def validate_policy(policy):
    def check(ok):
        require(ok, "Revisa las vistas y acciones de los tres roles.", "invalid_policy", 400)

    check(isinstance(policy, dict) and set(policy) == {"waiter", "cashier", "admin"})
    for row in policy.values():
        check(isinstance(row, dict) and set(row) == {"views", "actions"})
        views, actions = row["views"], row["actions"]
        check(isinstance(views, list) and isinstance(actions, list))
        check(all(isinstance(v, str) for v in views + actions))
        check(bool(views) and len(views) == len(set(views)) and len(actions) == len(set(actions)))
        check(set(views) <= set(VIEWS) and set(actions) <= set(ACTIONS))
        check(not set(actions) & {"create_orders", "charge_orders"} or bool(set(views) & {"tables", "orders"}))
        check("serve_orders" not in actions or "tables" in views)
    policy = {**policy, "admin": default_role_policy()["admin"]}
    return policy
