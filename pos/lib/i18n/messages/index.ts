import account from '@/lib/i18n/messages/modules/account.json'
import admin from '@/lib/i18n/messages/modules/admin.json'
import cash from '@/lib/i18n/messages/modules/cash.json'
import dashboard from '@/lib/i18n/messages/modules/dashboard.json'
import history from '@/lib/i18n/messages/modules/history.json'
import kds from '@/lib/i18n/messages/modules/kds.json'
import notifications from '@/lib/i18n/messages/modules/notifications.json'
import openingHours from '@/lib/i18n/messages/modules/openingHours.json'
import orders from '@/lib/i18n/messages/modules/orders.json'
import pantry from '@/lib/i18n/messages/modules/pantry.json'
import payment from '@/lib/i18n/messages/modules/payment.json'
import reservations from '@/lib/i18n/messages/modules/reservations.json'
import tables from '@/lib/i18n/messages/modules/tables.json'
import base from '@/lib/i18n/messages/es.json'

// Un archivo de textos por módulo del kit (Plan I): cada uno cuelga de su propia clave raíz y ninguno toca es.json.
// Los módulos escriben sus claves bajo `<modulo>.*`; el bloque `pos.*` de es.json sigue siendo el común.
export const messages = { ...base, dashboard, orders, tables, reservations, payment, history, pantry, account, notifications, kds, cash, admin, openingHours }
export type Messages = typeof messages
