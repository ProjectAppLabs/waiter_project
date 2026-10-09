'use client'

import Link from 'next/link'
import {PasswordField} from './SmartPassword'
import { AssistantMemory } from './AssistantMemory'
import { updateAccount } from '@/lib/services/api'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { initials } from '@/lib/domain/template'
import { prizeText } from '@/lib/domain/rewards'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Account, AccountOrder, Dish, RegisterForm } from '@/lib/types'
import { Plantilla } from '@/components/plantillas/Renderizador'
import { usePlantilla } from '@/components/plantillas/usePlantilla'
import type { TemplateData } from '@/lib/domain/plantillas'
import {
  Empty,
  FoodPhoto,
  Icon,
  money,
  Title,
  useSmartRoute,
  type IconName,
} from './SmartMenu'

export function SmartSignup() {
  const { register, busy, error, template } = useDinerStore()
  const signupPrize = template.acciones?.find((a) => a.accion === 'cuenta')?.premio
  const { go } = useSmartRoute()
  const [form, setForm] = useState<RegisterForm>({
    clave: '',
    nombre: '',
    correo: typeof window === 'undefined' ? '' : (()=>{try{return sessionStorage.getItem('smart-menu:signup-email')||''}catch{return ''}})(),
    celular: '',
    aceptaDatos: false,
    novedades: false,
  })
  const lock = useRef(false)
  const [sending, setSending] = useState(false)
  const [policy, setPolicy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lock.current) return
    lock.current = true
    setSending(true)
    try {
      const id = await register(form)
      if (id) go('cuenta/codigo')
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  return (
    <>
      <Title title="Crea tu cuenta" back="cuenta" />
      <div className="sm-auth-layout">
        <aside className="sm-auth-story">
          <span className="sm-auth-mark">
            <Icon name="plate" />
          </span>
          <span className="sm-eyebrow">Una experiencia más tuya</span>
          <h1>
            Los buenos momentos
            <br />
            se repiten.
          </h1>
          <p>
            Guarda tus favoritos, recuerda lo que pediste y vuelve por eso que
            tanto te gustó.
          </p>
          <div className="sm-auth-benefits">
            <span>
              <Icon name="heart" />
              Tus platos favoritos
            </span>
            <span>
              <Icon name="bag" />
              Tu historial de pedidos
            </span>
            {template.descuento.activo ? (
              <span>
                <Icon name="check" />
                {template.descuento.porcentaje}% en tu primera compra elegible
              </span>
            ) : signupPrize && (
              // Plan N: si crear la cuenta da un cupón o puntos (no el descuento de primera compra), se dice cuál.
              <span>
                <Icon name="check" />
                Al verificarla ganas {prizeText(signupPrize)}
              </span>
            )}
          </div>
        </aside>
        <form className="sm-auth-form" onSubmit={(e) => void submit(e)}>
          <h2>Crea tu cuenta</h2>
          <p>Empecemos por conocernos.</p>
          <label className="sm-field">
            <span>Tu nombre</span>
            <input
              autoComplete="name"
              required
              maxLength={60}
              value={form.nombre}
              placeholder="¿Cómo te llamas?"
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </label>
          <label className="sm-field">
            <span>Correo electrónico</span>
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={120}
              value={form.correo}
              placeholder="tu@correo.com"
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
          </label>
          <label className="sm-field">
            <span>
              Celular <small>(opcional)</small>
            </span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={20}
              value={form.celular}
              placeholder="Tu número de contacto"
              onChange={(e) => setForm({ ...form, celular: e.target.value })}
            />
          </label>
          <PasswordField label="Contraseña" value={form.clave||''} onChange={clave=>setForm({...form,clave})} autoComplete="new-password"/>
          <label className="sm-checkbox">
            <input
              type="checkbox"
              required
              checked={form.aceptaDatos}
              onChange={(e) =>
                setForm({ ...form, aceptaDatos: e.target.checked })
              }
            />
            <span>
              Acepto el uso de mis datos para crear mi cuenta y guardar mis
              pedidos.
            </span>
          </label>
          <button
            type="button"
            className="sm-text-button"
            onClick={() => setPolicy(!policy)}
          >
            Sobre tus datos
          </button>
          {policy && (
            <p className="sm-note">
              Tu nombre y contacto se guardan junto con tu cuenta, favoritos e
              historial para prestar el servicio. Puedes consultar al
              restaurante sobre el acceso o eliminación de tus datos. Las
              novedades son opcionales.
            </p>
          )}
          <label className="sm-checkbox">
            <input
              type="checkbox"
              checked={form.novedades}
              onChange={(e) =>
                setForm({ ...form, novedades: e.target.checked })
              }
            />
            <span>Quiero recibir novedades del restaurante (opcional).</span>
          </label>
          <p className="sm-note">
            Registro de demostración: verifica con seis dígitos, sin envío de correo.
          </p>
          {error && (
            <p role="alert" className="sm-error">
              {error}
            </p>
          )}
          <button
            className="sm-primary"
            type="submit"
            disabled={busy || sending}
          >
            {sending ? 'Creando cuenta…' : 'Continuar'}
            <Icon name="arrow" />
          </button>
          <button
            className="sm-text-button"
            type="button"
            onClick={() => go('carta')}
          >
            Seguir como invitado
          </button>
        </form>
      </div>
    </>
  )
}
export function SmartCode() {
  const { pendingAccount, verify, resendCode, busy, error } = useDinerStore()
  const { go } = useSmartRoute()
  const [code, setCode] = useState(''),
    [resent, setResent] = useState(false),
    [sending, setSending] = useState(false)
  const lock = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lock.current) return
    lock.current = true
    setSending(true)
    try {
      if (await verify(code)) go('cuenta/lista')
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  if (!pendingAccount)
    return (
      <Empty
        icon="user"
        title="Empecemos por tu cuenta"
        action="Crear cuenta"
        onAction={() => go('cuenta/registro')}
      />
    )
  return (
    <>
      <Title title="Un último paso" back="cuenta/registro" />
      <form
        className="sm-auth-form sm-narrow sm-code-form"
        onSubmit={(e) => void submit(e)}
      >
        <span className="sm-empty-icon">
          <Icon name="check" />
        </span>
        <h1>Verifica tu cuenta</h1>
        <p>{pendingAccount.form.correo}</p>
        <p className="sm-note">
          Estás en modo demostración. Escribe cualquier código de seis dígitos;
          no hemos enviado un correo.
        </p>
        <label className="sm-field">
          <span>Código de verificación</span>
          <div className="sm-code-boxes"><div aria-hidden="true">{Array.from({length:6},(_,i)=><span key={i} data-filled={!!code[i]}>{code[i]||''}</span>)}</div><input
            className="sm-code-input"
            aria-label="Código de verificación"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="000000"
          /></div>
        </label>
        {error && (
          <p className="sm-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="sm-primary"
          disabled={busy || sending || code.length !== 6}
        >
          {sending ? 'Verificando…' : 'Verificar y entrar'}
          <Icon name="arrow" />
        </button>
        <button className="sm-text-button" type="button" onClick={()=>go('cuenta/canal')}>Opciones de verificación</button>
        <button
          className="sm-text-button"
          type="button"
          disabled={busy || sending}
          onClick={async () => {
            if (await resendCode()) setResent(true)
          }}
        >
          Renovar código demo
        </button>
        {resent && (
          <p role="status">
            Código renovado. Tienes diez minutos para verificarlo.
          </p>
        )}
      </form>
    </>
  )
}
export function SmartAccount() {
  const { account, accountOrders, favorites, logout, busy, preview } = useDinerStore()
  const [savingMarketing,setSavingMarketing] = useState(false)
  const [marketingError,setMarketingError] = useState('')
  const { go, href } = useSmartRoute()
  if (!account)
    return (
      <>
        <Title title="Tu perfil" />
        <Empty
          icon="user"
          title="Hagamos esto más personal"
          action="Crear mi cuenta"
          onAction={() => go('cuenta/registro')}
        >
          Tu nombre, tus favoritos y tus pedidos, en un solo lugar.
          <Link className="sm-secondary" href={href('cuenta/entrar')}>Ya tengo una cuenta</Link>
        </Empty>
      </>
    )
  const links: {
    to: 'historial' | 'favoritos' | 'preferencias' | 'cuenta/informacion' | 'cuenta/clave' | 'cuenta/tarjetas'
    title: string
    detail: string
    icon: IconName
  }[] = [
    { to: 'cuenta/tarjetas', title: 'Mis tarjetas', detail: 'Explora el pago de demostración', icon: 'plate' },
    { to: 'cuenta/clave', title: 'Contraseña', detail: 'Accede desde otros dispositivos', icon: 'user' },
    { to: 'cuenta/informacion', title: 'Información de mi cuenta', detail: 'Nombre, contacto, alergias y novedades', icon: 'user' },
    {
      to: 'historial',
      title: 'Mis pedidos',
      detail: 'Recuerda y vuelve a pedir',
      icon: 'bag',
    },
    {
      to: 'favoritos',
      title: 'Mis favoritos',
      detail: 'Esos platos que siempre eliges',
      icon: 'heart',
    },
  ]
  const enlaces = <>
    <h2>General</h2>
    {links.map((l) => (
      <Link key={l.to} href={href(l.to)} className="sm-profile-link">
        <span className="sm-empty-icon"><Icon name={l.icon} /></span>
        <span><strong>{l.title}</strong><small>{l.detail}</small></span>
        <Icon name="arrow" />
      </Link>
    ))}
  </>
  const notificaciones = <><h2>Notificaciones</h2><label className="sm-profile-notification"><span><strong>Novedades y promociones</strong><small>Recibe novedades del restaurante</small></span><input type="checkbox" role="switch" aria-label="Novedades y promociones" checked={!!account.novedades} disabled={savingMarketing||!!preview} onChange={async e=>{if(savingMarketing)return;setSavingMarketing(true);setMarketingError('');try{const response=await updateAccount({novedades:e.target.checked});useDinerStore.setState({account:response.cuenta})}catch(error){setMarketingError(error instanceof Error?error.message:'No pudimos guardar tu preferencia')}finally{setSavingMarketing(false)}}}/></label>{marketingError&&<p className="sm-error" role="alert">{marketingError}</p>}<AssistantMemory /></>
  const salir = <button className="sm-secondary" disabled={busy} onClick={async () => { await logout(); if (!useDinerStore.getState().error) go('carta') }}><Icon name="logout" />Cerrar sesión</button>
  return (
    <>
      <Title title="Mi perfil" />
      <ProfileSection account={account} pedidos={accountOrders.length} favoritos={favorites.length} enlaces={enlaces} notificaciones={notificaciones} salir={salir} />
    </>
  )
}
// Datos que una plantilla del perfil puede enlazar (contrato «perfil»).
export function profileTemplateData(account: Account, pedidos: number, favoritos: number) {
  return { 'cuenta.nombre': account.nombre, 'cuenta.iniciales': initials(account.nombre), 'cuenta.correo': account.correo, 'cuenta.celular': account.celular ?? '',
    'cuenta.pedidos': pedidos, 'cuenta.favoritos': favoritos }
}

// Plan K, paquete D: la pantalla de la cuenta con plantilla propia. Los enlaces, el interruptor y cerrar sesión llegan
// del código como ranuras obligatorias; el avatar, la cabecera y las estadísticas se arman aquí.
export function ProfileSection({ account, pedidos, favoritos, enlaces, notificaciones, salir }: { account: Account; pedidos: number; favoritos: number; enlaces: ReactNode; notificaciones: ReactNode; salir: ReactNode }) {
  const { arbol, marker } = usePlantilla('perfil')
  const avatar = <span className="sm-avatar sm-avatar-large">{initials(account.nombre)}</span>
  const cabecera = <div className="sm-profile-head">{avatar}<div><h1>{account.nombre}</h1><p>{account.correo}</p>{account.celular && <p>{account.celular}</p>}</div></div>
  const estadisticas = <div className="sm-profile-stats"><div><strong>{pedidos}</strong><span>Pedidos</span></div><div><strong>{favoritos}</strong><span>Favoritos</span></div></div>
  const factory = <>{cabecera}{estadisticas}{enlaces}{notificaciones}{salir}</>
  return <section className="sm-profile" {...marker}>
    {arbol ? <Plantilla arbol={arbol} datos={profileTemplateData(account, pedidos, favoritos)} ranuras={{ cabecera, avatar, estadisticas, enlaces, notificaciones, salir }} fallback={factory} /> : factory}
  </section>
}
const historyStatus: Record<AccountOrder['estado'], string> = {
  pendiente_pago: 'Pendiente de pago', enviado: 'Recibido', en_cocina: 'En preparación', listo: 'Listo',
  servido: 'Entregado', pagado: 'Pagado', fallido: 'No enviado',
}

export function SmartHistory() {
  const { account, accountOrders, loadAccount, order, cart, keys, add, busy } =
    useDinerStore()
  const { go, href } = useSmartRoute()
  const [tab, setTab] = useState<'all' | 'active'>('all'),
    [reordering, setReordering] = useState<string | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    void loadAccount()
  }, [loadAccount])
  const orders = accountOrders
    .filter(
      (o) =>
        (!o.restaurante || o.restaurante === keys?.rest) &&
        (!o.sede || o.sede === keys?.venue),
    )
    .filter((o) => tab === 'all' || o.estado !== 'pagado')
  const reorder = async (o: AccountOrder) => {
    if (lock.current) return
    lock.current = true
    setReordering(o.id)
    try {
      for (const line of o.lineas ?? []) {
        await add(line.producto_id, line.cantidad, '')
        if (useDinerStore.getState().error) return
      }
      go('pedido')
    } finally {
      lock.current = false
      setReordering(null)
    }
  }
  return (
    <>
      <Title title="Mis pedidos" sub="Cada visita, un buen recuerdo" />
      {!!cart?.lineas.length && (
        <Link className="sm-profile-link" href={href('pedido')}>
          <span className="sm-empty-icon">
            <Icon name="bag" />
          </span>
          <span>
            <strong>Tienes un pedido por confirmar</strong>
            <small>Revisa tu carrito y envíalo a cocina</small>
          </span>
          <Icon name="arrow" />
        </Link>
      )}
      {order && (
        <Link className="sm-profile-link" href={href('estado', order.id)}>
          <span className="sm-empty-icon">
            <Icon name="clock" />
          </span>
          <span>
            <strong>Seguir mi último pedido</strong>
            <small>Consulta cómo va tu preparación</small>
          </span>
          <Icon name="arrow" />
        </Link>
      )}
      {!account ? (
        <Empty
          icon="bag"
          title="Tus buenos recuerdos van aquí"
          action="Crear mi cuenta"
          onAction={() => go('cuenta/registro')}
        >
          Crea una cuenta para consultar tu historial personal.
        </Empty>
      ) : (
        <>
          <div className="sm-segmented">
            <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>
              Todos
            </button>
            <button
              aria-pressed={tab === 'active'}
              onClick={() => setTab('active')}
            >
              En curso
            </button>
          </div>
          {orders.length ? (
            <div className="sm-history-grid">
              {orders.map((o) => (
                <HistoryCard key={o.id} order={o} busy={busy} reordering={reordering} reorder={reorder} />
              ))}
            </div>
          ) : (
            <Empty
              icon="bag"
              title={
                tab === 'active'
                  ? 'Todo al día'
                  : 'Tu primera visita empieza aquí'
              }
              action="Explorar el menú"
              onAction={() => go('carta')}
            >
              {tab === 'active'
                ? 'No tienes pedidos en curso.'
                : 'Cuando confirmes un pedido, podrás encontrarlo aquí.'}
            </Empty>
          )}
        </>
      )}
    </>
  )
}

export function SmartAccountEdit() {
  const { account, preview } = useDinerStore()
  const { go } = useSmartRoute()
  const [name,setName] = useState(account?.nombre || '')
  const [phone,setPhone] = useState(account?.celular || '')
  const [allergens,setAllergens] = useState(account?.alergenos || '')
  const [marketing,setMarketing] = useState(account?.novedades || false)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const lock = useRef(false)
  if (!account) return <Empty icon="user" title="Abre tu cuenta para editarla" action="Mi cuenta" onAction={() => go('cuenta')}/>
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (lock.current || preview) return
    lock.current = true; setSaving(true); setMessage('')
    try {
      const result = await updateAccount({nombre:name.trim(),celular:phone.trim(),novedades:marketing,alergenos:allergens.trim()})
      useDinerStore.setState({account:result.cuenta,accountOrders:result.pedidos})
      setMessage('Cambios guardados')
    } catch(error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar tus cambios') }
    finally { lock.current = false; setSaving(false) }
  }
  return <><Title title="Información de mi cuenta" back="cuenta"/><form className="sm-auth-form sm-narrow sm-account-edit" onSubmit={e => void submit(e)}><label className="sm-field"><span>Tu nombre</span><input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name"/></label><label className="sm-field"><span>Correo electrónico</span><input value={account.correo} type="email" readOnly autoComplete="email"/></label><label className="sm-field"><span>Celular</span><input value={phone} onChange={e => setPhone(e.target.value)} type="tel" maxLength={20} autoComplete="tel"/></label><label className="sm-field"><span>Alergias y alérgenos (opcional)</span><textarea value={allergens} onChange={e=>setAllergens(e.target.value)} maxLength={500} rows={3} placeholder="Por ejemplo: maní, leche o mariscos"/></label><p className="sm-note">Te los recordaremos al pedir para que confirmes qué debe saber la cocina.</p><label className="sm-checkbox"><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)}/>Quiero recibir novedades y promociones</label><p className="sm-note">El correo identifica tu cuenta. Su cambio requiere una nueva verificación y todavía no está disponible.</p>{message && <p role="status">{message}</p>}<button className="sm-primary" disabled={saving || !!preview}>{saving ? 'Guardando…' : 'Guardar cambios'}<Icon name="check"/></button></form></>
}

export function SmartReceipt({id}: {id: string | null}) {
  const {accountOrders,keys,entry} = useDinerStore()
  const {go,href} = useSmartRoute()
  const order = accountOrders.find(o => o.id === id && (!o.restaurante || o.restaurante === keys?.rest) && (!o.sede || o.sede === keys?.venue))
  if (!order) return <Empty icon="bag" title="No encontramos este pedido en tu cuenta" action="Mis pedidos" onAction={() => go('historial')}/>
  const products = entry?.carta.categorias.flatMap(c => c.productos) || []
  return <><Title title="Detalle del pedido" back="historial"/><PaperReceipt order={order} products={products}/><Link className="sm-primary" href={href('historial')}>Volver a mis pedidos<Icon name="arrow"/></Link></>
}

// ---- Plan K5: componentes plantillables de la cuenta ---------------------------------------------------------------
const longDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const orderLines = (order: AccountOrder) => (order.lineas ?? []).map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, subtotal: l.precio * l.cantidad }))
// Datos que una plantilla de la tarjeta de historial puede enlazar (contrato «tarjeta-historial»).
export function historyTemplateData(order: AccountOrder): TemplateData {
  return { 'pedido.numero': `#${order.id.slice(0, 8)}`, 'pedido.estado': historyStatus[order.estado], 'pedido.local': order.local, 'pedido.fecha': longDate(order.fecha),
    'pedido.mesa': !!order.mesa, 'pedido.mesa.numero': order.mesa ?? null, 'pedido.total': order.total, 'pedido.lineas': orderLines(order) }
}
export function HistoryCard({ order: o, busy, reordering, reorder }: { order: AccountOrder; busy: boolean; reordering: string | null; reorder: (order: AccountOrder) => Promise<void> }) {
  const { href } = useSmartRoute()
  const { arbol, marker } = usePlantilla('tarjeta-historial')
  const estado = <span className="sm-status-chip">{historyStatus[o.estado]}</span>
  const cabecera = <div className="sm-history-top"><span><Icon name="bag" />Pedido #{o.id.slice(0, 8)}</span>{estado}</div>
  const titulo = <h2>{o.local}</h2>
  const fecha = <p>{longDate(o.fecha)}{o.mesa ? ` · Mesa ${o.mesa}` : ''}</p>
  const lineas = <ul>{o.lineas?.map((l, i) => <li key={i}><span>{l.cantidad} × {l.nombre}</span><span>{money(l.precio * l.cantidad)}</span></li>)}</ul>
  const total = <div className="sm-total"><span>Tu consumo</span><strong>{money(o.total)}</strong></div>
  const acciones = <div className="sm-history-actions"><Link className="sm-text-button" href={href('opinion',o.id)}>Valorar visita</Link><Link className="sm-text-button" href={href('recibo',o.id)}>Ver detalle</Link><Link className="sm-text-button" href={href('estado', o.id)}>Ver estado</Link>{!!o.lineas?.length && <button className="sm-secondary" disabled={busy || reordering !== null} onClick={() => void reorder(o)}>{reordering === o.id ? 'Agregando…' : 'Volver a pedir'}</button>}</div>
  const factory = <>{cabecera}{titulo}{fecha}{lineas}{total}{acciones}</>
  return (
    <article className="sm-history-card" {...marker}>
      {arbol ? <Plantilla arbol={arbol} datos={historyTemplateData(o)} ranuras={{ cabecera, estado, titulo, fecha, lineas, total, acciones }} fallback={factory} /> : factory}
    </article>
  )
}

// Datos que una plantilla del recibo puede enlazar (contrato «recibo-papel»).
export function receiptTemplateData(order: AccountOrder): TemplateData {
  return { 'pedido.numero': `#${order.id.slice(0, 8)}`, 'pedido.estado': historyStatus[order.estado], 'pedido.local': order.local,
    'pedido.fecha': new Date(order.fecha).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }), 'pedido.mesa': !!order.mesa, 'pedido.mesa.numero': order.mesa ?? null,
    'pedido.descuento': order.descuento > 0, 'pedido.descuento.monto': order.descuento > 0 ? order.descuento : null, 'pedido.total': order.total, 'pedido.lineas': orderLines(order) }
}
export function PaperReceipt({ order, products }: { order: AccountOrder; products: Dish[] }) {
  const { arbol, marker } = usePlantilla('recibo-papel')
  const cabecera = <header><span className="sm-avatar"><Icon name="plate"/></span><h1>{order.local}</h1><p>{new Date(order.fecha).toLocaleString('es-CO',{dateStyle:'long',timeStyle:'short'})}</p><p>Pedido #{order.id.slice(0,8)}{order.mesa ? ` · Mesa ${order.mesa}` : ''}</p><span className="sm-status-chip">{historyStatus[order.estado]}</span></header>
  const lineas = <div className="sm-receipt-lines">{order.lineas?.map((line,i) => <div key={i}><FoodPhoto dish={products.find(p => p.id === line.producto_id) || {id:line.producto_id,nombre:line.nombre,precio:line.precio,agotado:false,categorias:[]}}/><span><strong>{line.nombre}</strong><small>{line.cantidad} × {money(line.precio)}</small></span><strong>{money(line.cantidad * line.precio)}</strong></div>)}</div>
  const descuento = order.descuento > 0 ? <div className="sm-receipt-total"><span>Descuento</span><strong>{money(order.descuento)}</strong></div> : null
  const total = <div className="sm-receipt-total"><span>Total</span><strong>{money(order.total)}</strong></div>
  const factory = <>{cabecera}{lineas}{descuento}{total}</>
  return (
    <article className="sm-paper-receipt" {...marker}>
      {arbol ? <Plantilla arbol={arbol} datos={receiptTemplateData(order)} ranuras={{ cabecera, lineas, descuento, total }} fallback={factory} /> : factory}
    </article>
  )
}
