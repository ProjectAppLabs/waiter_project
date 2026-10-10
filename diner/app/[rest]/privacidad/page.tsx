'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { getOrganization } from '@/lib/services/api'
import '@/components/smart/smart-tokens.css'
import '@/components/smart/smart-forms.css'

// Plan D: la política de tratamiento de datos que se acepta al guardar direcciones (menú) o con «Acepto» (WhatsApp).
// Versión 2026-10-09, la misma que guarda el servidor (loyalty/delivery.py, POLICY_VERSION).
export default function PrivacyPolicy() {
  const { rest } = useParams<{ rest: string }>()
  const [name, setName] = useState('el restaurante')
  useEffect(() => { getOrganization(rest).then((o) => setName(o.organizacion.nombre)).catch(() => undefined) }, [rest])
  return (
    <main className="smart-menu sm-legal">
      <div className="sm-page">
        <h1>Política de tratamiento de datos personales</h1>
        <p className="sm-note">Versión 2026-10-09 · Ley 1581 de 2012 y Decreto 1377 de 2013</p>
        <h2>Responsable</h2>
        <p>{name} es responsable de tus datos. Waiter, de ProjectApp, los procesa por encargo del restaurante para atender tus pedidos.</p>
        <h2>Qué datos guardamos</h2>
        <p>Tu nombre, tu celular, las direcciones que decides guardar (con su ubicación en el mapa e indicaciones) y el historial de tus pedidos.</p>
        <h2>Para qué</h2>
        <ul>
          <li>Entregar tus domicilios y contactarte sobre tu pedido.</li>
          <li>Ofrecerte tus direcciones guardadas para que pedir sea más rápido.</li>
          <li>Conocer tus preferencias (qué, cuándo y por dónde pides) para atenderte mejor y recomendarte platos.</li>
        </ul>
        <p>No vendemos ni compartimos tus datos con terceros ajenos a la atención de tus pedidos.</p>
        <h2>Tus derechos</h2>
        <p>Puedes conocer, actualizar, rectificar y suprimir tus datos, y retirar esta autorización cuando quieras: en el menú, en «Mi perfil» → «Mis direcciones» → «Retirar la autorización de mis datos», o escribiéndole al restaurante. Al retirarla borramos tus direcciones; los pedidos que ya hiciste se conservan por obligaciones contables.</p>
        <p>Si no autorizas, igual puedes pedir: tus datos quedan solo en ese pedido.</p>
      </div>
    </main>
  )
}
