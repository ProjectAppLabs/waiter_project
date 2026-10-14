'use client'

import { accountScreen, dinerHas } from '@/lib/domain/modules'/* eslint-disable @next/next/no-img-element -- Original exported illustrations and restaurant logo. */
import Link from 'next/link'
import { useRef } from 'react'
import type { Entry } from '@/lib/types'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { initials } from '@/lib/domain/template'
import { pickGreeting } from '@/lib/domain/greeting'
import { FoodPhoto, Icon, money, useSmartRoute } from './SmartMenu'
import { Plantilla } from '@/components/plantillas/Renderizador'
import { usePlantilla } from '@/components/plantillas/usePlantilla'
import type { TemplateData } from '@/lib/domain/plantillas'

// Saludo de la cabecera: frase del repertorio según la hora (lib/domain/greeting) o el texto que fijó el administrador
// en Diseño del menú → Saludo; con cuenta lleva el primer nombre. No es un enlace: la navegación vive en el botón.
export function greeting(entry: Entry, accountName?: string | null, hour?: number, seed?: number) {
  return pickGreeting({ admin: entry.contexto.marca.saludo, name: accountName, hour, seed })
}
export function venueLine(entry: Entry) {
  const parts = [entry.contexto.marca.nombre || entry.carta.restaurante, entry.contexto.sede.nombre].filter(Boolean)
  if (entry.contexto.mesa) parts.push(`Mesa ${entry.contexto.mesa.numero}`)
  return parts.join(' · ')
}

// Datos que una plantilla de la cabecera puede enlazar (contrato «cabecera»).
export function headerTemplateData(entry: Entry, saludo: string): TemplateData {
  return {
    'marca.nombre': entry.contexto.marca.nombre || entry.carta.restaurante, 'sede.nombre': entry.contexto.sede.nombre, 'saludo': saludo,
    'linea': venueLine(entry), 'mesa': !!entry.contexto.mesa, 'mesa.numero': entry.contexto.mesa?.numero ?? null, 'marca.logo': !!entry.contexto.marca.logo,
  }
}

export function SmartHeader({ entry, current='portada' }: { entry: Entry;current?:'portada'|'carta' }) {
  const { href } = useSmartRoute()
  const account = useDinerStore(s => s.account)
  const dialog = useRef<HTMLDialogElement>(null)
  const { arbol, marker } = usePlantilla('cabecera')
  const saludo = greeting(entry, account?.nombre)
  const logo = entry.contexto.marca.logo ? <img src={entry.contexto.marca.logo} alt="" /> : null
  const greetingLine = <div className="sm-greeting-line">
    {logo}
    <div>
      <strong>{saludo}</strong>
      <span>{venueLine(entry)}</span>
    </div>
  </div>
  const navigation = <button aria-label="Abrir navegación" onClick={() => dialog.current?.showModal()}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M3 6h18M3 12h13M3 18h18"/></svg></button>
  const factory = <>{greetingLine}{navigation}</>
  return <>
    <header className="sm-location-header" {...marker}>
      {arbol ? <Plantilla arbol={arbol} datos={headerTemplateData(entry, saludo)} ranuras={{ saludo: greetingLine, logo, navegacion: navigation }} fallback={factory} /> : factory}
    </header>
    <dialog ref={dialog} className="sm-navigation" aria-label="Navegación principal" onClick={e => {if(e.target === e.currentTarget) dialog.current?.close()}}>
      <div className="sm-navigation-inner">
        <header>{dinerHas(entry, 'fidelizacion') ? <Link href={href('cuenta')} onClick={() => dialog.current?.close()} className="sm-profile-link"><span className="sm-avatar">{account ? initials(account.nombre) : <Icon name="user"/>}</span><span><span>{account?.nombre || 'Bienvenido'}</span><small>Mi perfil</small></span></Link> : <span />}<button className="sm-icon" aria-label="Cerrar navegación" onClick={() => dialog.current?.close()}><Icon name="close"/></button></header>
        <nav>{([['ubicacion','Restaurante y mesa'],['recompensas','Recompensas'],['carta','Menú'],['pedido','Pedido actual'],['historial','Mis pedidos'],['favoritos','Favoritos']] as const).filter(([screen]) => !accountScreen(screen) || dinerHas(entry, 'fidelizacion')).map(([screen,label]) => <Link key={screen} aria-current={screen===current?'page':undefined} href={href(screen)} onClick={() => dialog.current?.close()}>{label}<Icon name="arrow"/></Link>)}</nav>
        <p>{entry.contexto.sede.nombre}{entry.contexto.mesa ? ` · Mesa ${entry.contexto.mesa.numero}` : ''}</p>
      </div>
    </dialog>
  </>
}

export function SmartHome({entry}: {entry: Entry}) {
  const {href} = useSmartRoute()
  const account = useDinerStore(s => s.account)
  const order = useDinerStore(s => s.order)
  const activeOrder = order && !['pagado','fallido'].includes(order.estado) ? order : null
  const dishes = [...new Map(entry.carta.categorias.flatMap(c=>c.productos).map(d=>[d.id,d])).values()].filter(d=>!d.agotado)
  return <>
    <SmartHeader entry={entry}/>
    <h1 className="sm-home-title">{activeOrder ? `Disfruta tu visita a ${entry.contexto.marca.nombre}` : account ? `${account.nombre.split(' ')[0]}, encontremos tu próximo plato favorito` : 'Encontremos el plato perfecto para ti'}</h1>
    {activeOrder ? <><Link href={href('estado',activeOrder.id)} className="sm-home-active">{dishes[0] && <FoodPhoto dish={dishes[0]}/>}<div><h2>Pedido activo</h2><p>Consulta cómo va tu pedido</p></div><span className="sm-home-arrow"><Icon name="arrow"/></span></Link>{entry.carta.categorias.filter(category=>category.productos.some(d=>!d.agotado)).slice(0,2).map(category=><section key={category.id}><div className="sm-section-heading"><h2>{category.nombre}</h2></div><div className="sm-food-rail">{category.productos.filter(d=>!d.agotado).slice(0,8).map(d=><Link className="sm-food-card sm-food-link" href={href('plato',d.id)} key={d.id}><FoodPhoto dish={d}/><h3>{d.nombre}</h3><div className="sm-food-bottom"><strong>{money(d.precio)}</strong></div></Link>)}</div></section>)}<Link className="sm-secondary" href={href('carta')}>Ver todo el menú<Icon name="arrow"/></Link></> : <div className="sm-home-options">
      <Link className="sm-home-card" href={href('carta')}><img src="/smart-menu/menu.png" alt=""/><h2>Ir al menú</h2><p>Si ya sabes qué se te antoja, esta es tu mejor opción</p><span className="sm-home-arrow"><Icon name="arrow"/></span></Link>
    </div>}
  </>
}
