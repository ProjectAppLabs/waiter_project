from experience_app.adapters.backend import backend_for, client_for
from experience_app.adapters.odoo.client import OdooClient


def for_menu(tenant, menu):
    config = client_for(tenant, OdooClient).call_kw('pos.config', 'waiter_banner_settings', [[tenant.config_id]])
    if not config.get('configured'):
        return None  # Conserva los destacados automáticos hasta configurar banners.
    products = {p['id']: p for c in menu['categorias'] for p in c['productos']}
    categories = {c['id'] for c in menu['categorias']}
    return [b for b in config.get('banners', []) if b.get('active') and (not b.get('configs') or tenant.config_id in b['configs']) and (
        b['target']=='none' or b['target']=='category' and b['targetId'] in categories or
        b['target']=='product' and b['targetId'] in products and not products[b['targetId']]['agotado'])]
