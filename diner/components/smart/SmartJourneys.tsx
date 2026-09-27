'use client'
/* eslint-disable @next/next/no-img-element -- Original illustrations exported from the supplied design. */
import { useRef, useState } from 'react'
import Link from 'next/link'
import type { Dish, Entry } from '@/lib/types'
import { SmartDish, DishRating, FoodPhoto, Icon, money, Title, useSmartRoute } from './SmartMenu'
import {Recorrido} from './Recorrido'

const questions = [
  { title: '¿Cómo te sientes ahora?', options: ['🥵 Tengo sed', '😋 Tengo hambre', '🥱 Cansado', '😤 Enojado', '😑 Aburrido', '🤒 Enfermo', '⚡ Con energía', '😊 Otro'] },
  { title: '¿Qué comida buscas?', options: ['🍳 Desayuno', '🥑 Brunch', '🍲 Almuerzo', '🍽 Cena', '🥨 Algo para picar', '☕ Hora del café', '✨ Sorpréndeme'] },
  { title: '¿Qué te gustaría beber?', options: ['🍹 Sin alcohol', '🍷 Con alcohol', '☕ Con cafeína'] },
  { title: '¿Qué intensidad prefieres?', options: [] },
  { title: '¿Sigues alguna dieta?', options: ['🌱 Orgánica', '🌾 Sin gluten', '🥬 Vegana', '🥩 Paleo', '🍽 Ninguna en particular'] },
  { title: '¿Tienes alguna alergia?', options: ['✓ Ninguna', '🥚 Huevo', '🥛 Lactosa', '🌾 Gluten', '🌽 Maíz', '🦐 Mariscos', '🥜 Frutos secos', '🥕 Zanahoria', '🍎 Manzana', '🍅 Tomate', '🥦 Brócoli', '🍽 Otra'] },
  { title: '¿Te gusta probar cosas nuevas?', options: ['🥬 Vegetales exóticos', '🥭 Frutas exóticas', '🌱 Prefiero lo conocido'] },
  { title: '¿Qué proteína prefieres?', options: ['🍗 Pollo', '🥓 Cerdo', '🥩 Res', '🐟 Pescado', '🌱 Vegetal'] },
]
const choiceImages: string[][] = [
  [
    "emoji-hot-face-114345a8.png",
    "emoji-face-savouring-food-87b512b2.png",
    "emojy-tired-dc738f72.png",
    "emojy-angry-6b6e2f23.png",
    "emoji-expressionless-face-df552f87.png",
    "emoji-hot-face-114345a8.png",
    "emoji-hot-face-114345a8.png",
    "emoji-hot-face-114345a8.png"
  ],
  [
    "emoji-omelette-417fbf4b.png",
    "emoji-sandwich-fe1bd4dd.png",
    "emoji-spaghetti-de6ca56a.png",
    "emoji-champagne-glasses-cc9e0852.png",
    "emoji-candy-5815cf1a.png",
    "emoji-teapot-102a699a.png",
    "emoji-shortcake-06f64454.png"
  ],
  [
    "emoji-beverage-box-57eba283.png",
    "emoji-beer-mug-ecf4f8fc.png",
    "emoji-coffee-80d5013a.png"
  ],
  [],
  [
    "emoji-plant-1b858620.png",
    "emoji-gluten-free-1447917d.png",
    "emoji-broccoli-ac46b7ca.png",
    "emoji-paleo-1c7c80ca.png",
    "emoji-thinking-face-fd261ed9.png"
  ],
  [
    "emoji-none-9382ba6b.png",
    "emoji-egg-01063649.png",
    "emoji-milk-6f6158aa.png",
    "emoji-gluten-cc655099.png",
    "emoji-corn-a49471ee.png",
    "emoji-shells-8148e86c.png",
    "emoji-nuts-c099ade3.png",
    "emoji-carrot-2046dbdd.png",
    "emoji-green-apple-46ae8214.png",
    "emoji-tomato-7bb84cd7.png",
    "emoji-broccoli-ac46b7ca.png",
    "emoji-thinking-face-fd261ed9.png"
  ],
  [
    "emoji-mushroom-24999c52.png",
    "emoji-ananas-05056646.png",
    "emoji-plant-1b858620.png"
  ],
  [
    "emoji-chicken-0761b2ab.png",
    "emoji-pork-92bfff84.png",
    "emoji-beef-07f11dae.png",
    "emoji-fish-2f434630.png",
    "emoji-plant-1b858620.png"
  ]
]
type Preferences = { answers: string[][]; updated: string }
const keyFor = (entry: Entry) => `smart-menu:preferences:${entry.contexto.restaurante.slug}:${entry.contexto.sede.slug}`
function readPreferences(entry: Entry): Preferences | null {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(entry)) || 'null')
    return value && Array.isArray(value.answers) && value.answers.length === 8 && value.answers.every((a: unknown) => Array.isArray(a) && a.every(v => typeof v === 'string')) ? value : null
  } catch { return null }
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// Preferences rank known catalog metadata; they never certify a dish as allergy-safe.
export function rankDishes(dishes: Dish[], answers: string[][]) {
  const words = answers.filter((_,i) => ![3,4,5].includes(i)).flat().flatMap(a => normalize(a).split(/\s+/)).filter(w => w.length > 3 && !['tengo','prefiero','ninguna','particular','alcohol'].includes(w))
  const score = (d: Dish) => words.reduce((sum, word) => sum + Number(normalize(`${d.nombre} ${d.descripcion || ''} ${(d.atributos?.etiquetas || []).join(' ')}`).includes(word)), 0)
  const allergens = (answers[5] || []).filter(a => a !== '✓ Ninguna' && a !== '🍽 Otra').map(a => normalize(a).replace(/^[^a-z]+/, ''))
  return dishes.filter(d => !d.agotado && !(d.atributos?.alergenos || []).some(a => allergens.some(selected => normalize(a).includes(selected) || selected.includes(normalize(a))))).sort((a,b) => score(b) - score(a))
}
export function SmartAssistant({ entry }: { entry: Entry }) {
  const { href } = useSmartRoute()
  const [step, setStep] = useState(-1)
  const [answers, setAnswers] = useState<string[][]>(Array.from({length: 8}, () => []))
  const [grid, setGrid] = useState(true)
  const [detail,setDetail] = useState<string|null>(null)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const [saved, setSaved] = useState(false)
  const [category, setCategory] = useState<number | null>(null)
  const question = questions[step]
  const dishes = rankDishes([...new Map(entry.carta.categorias.flatMap(c => c.productos).map(d => [d.id,d])).values()], answers).filter(d => category === null || d.categorias.includes(category))
  const finish = () => {
    try { localStorage.setItem(keyFor(entry), JSON.stringify({ answers, updated: new Date().toISOString() })); setSaved(true) } catch { setSaved(false) }
    setStep(8)
  }
  const next = () => step === 7 ? finish() : setStep(step + 1)
  const toggle = (option: string) => setAnswers(previous => previous.map((items, i) => i !== step ? items : items.includes(option) ? items.filter(v => v !== option) : step === 5 && option === '✓ Ninguna' ? [option] : [...items.filter(v => v !== '✓ Ninguna'), option]))
  if (step === -2) return <section className="sm-journey"><Title title="Volvamos a elegir"/><h1>¿Qué te gustaría hoy?</h1><div className="sm-home-options"><button className="sm-home-card" onClick={()=>{setAnswers(Array.from({length:8},()=>[]));setStep(0)}}><img src="/smart-menu/robot.png" alt=""/><h2>Una nueva selección</h2><p>Cuéntanos qué te apetece en esta visita.</p><span className="sm-home-arrow"><Icon name="arrow"/></span></button><button className="sm-home-card" onClick={()=>setStep(8)}><img src="/smart-menu/menu.png" alt=""/><h2>Usar mi última selección</h2><p>Conserva los gustos que guardaste para este restaurante.</p><span className="sm-home-arrow"><Icon name="arrow"/></span></button></div></section>
  if (step === -1) return <section className="sm-journey sm-intro"><Title title="Tu asistente"/><div className="sm-orbit-hero"><img src="/smart-menu/robot.png" alt=""/></div><h1>Hola, encontremos algo delicioso</h1><p>Cuéntanos qué te gusta y descubre opciones del menú de {entry.contexto.marca.nombre}.</p><div className="sm-journey-footer"><button className="sm-primary" onClick={() => { const previous = readPreferences(entry); if (previous) setAnswers(previous.answers); setStep(0) }}>Empezar<Icon name="arrow"/></button><button className="sm-text-button" onClick={() => { const previous = readPreferences(entry); if (previous) { setAnswers(previous.answers); setSaved(true); setStep(-2) } else setStep(0) }}>Usar mis preferencias</button><Link href={href('carta')}>Ir directamente al menú</Link></div></section>
  if (step === 8) return <><Title title="Selección para ti" back="portada"/><div className="sm-section-heading"><p>{saved ? 'Preferencias guardadas en este dispositivo' : 'Explora el menú según tus gustos'}</p><button className="sm-icon" aria-label={grid ? 'Ver como lista' : 'Ver como tarjetas'} onClick={() => setGrid(!grid)}><Icon name="menu"/></button></div><nav className="sm-categories" aria-label="Categoría de recomendaciones"><button aria-pressed={category === null} onClick={() => setCategory(null)}>Todo</button>{entry.carta.categorias.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.nombre}</button>)}</nav>{answers[5].some(a => a !== '✓ Ninguna') && <p className="sm-preference-note">Confirma ingredientes y posibles trazas con el restaurante antes de pedir. Las preferencias no garantizan la ausencia de alérgenos.</p>}<div className={grid ? 'sm-recommendations' : 'sm-food-list'}>{dishes.map(d => <Link href={href('plato',d.id)} key={d.id} className="sm-food-card sm-food-link" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();setDetail(String(d.id));detailDialog.current?.showModal()}}><FoodPhoto dish={d}/><DishRating dish={d}/><h3>{d.nombre}</h3><div className="sm-food-bottom"><strong>{money(d.precio)}</strong><Icon name="arrow"/></div></Link>)}</div>{!dishes.length && <p>No hay platos disponibles en esta categoría.</p>}<button className="sm-secondary" onClick={() => setStep(0)}>Cambiar mis respuestas</button><dialog className="sm-recommendation-dialog" ref={detailDialog} onClose={()=>setDetail(null)}>{detail&&<SmartDish key={detail} entry={entry} id={detail} rest={entry.contexto.restaurante.slug} venue={entry.contexto.sede.slug} token={entry.contexto.mesa?.token||null} onClose={()=>detailDialog.current?.close()}/>}</dialog></>
  return <section className="sm-journey"><header className="sm-step-header"><button className="sm-icon" aria-label="Paso anterior" onClick={() => setStep(step - 1)}><Icon name="back"/></button><span>Paso {step + 1}</span><button onClick={next}>Omitir pregunta</button></header><progress className="sm-step-progress" value={step + 1} max={8} aria-label="Progreso del asistente"/><h1>{question.title}</h1><p>{step === 3 ? 'De suave a intenso' : 'Selecciona las opciones que prefieras:'}</p>{step === 3 ? <div className="sm-strength"><output>{answers[3][0] || '3'}</output><input aria-label="Intensidad" type="range" min="1" max="5" value={answers[3][0] || '3'} onChange={e => setAnswers(a => a.map((v,i) => i === 3 ? [e.target.value] : v))}/><div><span>Suave</span><span>Intenso</span></div></div> : <div className="sm-answer-chips">{question.options.map((option,index) => <button key={option} aria-label={option} aria-pressed={answers[step].includes(option)} onClick={() => toggle(option)}><img src={`/smart-menu/emoji/${choiceImages[step][index]}`} alt=""/>{option.slice(option.indexOf(' ') + 1)}</button>)}</div>}<div className="sm-journey-footer"><Link href={href('carta')}>Llévame al menú</Link><button className="sm-primary" onClick={next}>{step === 7 ? 'Ver mi selección' : 'Continuar'}</button></div></section>
}
export function SmartPreferences({ entry, detail=false }: { entry: Entry; detail?:boolean }) {
  const { href } = useSmartRoute()
  const [preferences, setPreferences] = useState<Preferences | null>(() => typeof window === 'undefined' ? null : readPreferences(entry))
  if(!preferences)return <section className="sm-journey sm-intro sm-preferences-empty"><Title title="Mis preferencias" back="cuenta"/><div className="sm-orbit-hero"><img src="/smart-menu/robot-left.png" alt=""/></div><h1>Aún no has elegido tus preferencias</h1><p>Deja que tu asistente te ayude a encontrar los platos que más te gustan.</p><div className="sm-journey-footer"><Link className="sm-primary" href={href('asistente')}>Elegir mis preferencias<Icon name="plus"/></Link></div></section>
  if(!detail)return <><Title title="Mis preferencias" back="cuenta"/><section className="sm-preference-list"><h2>Tu selección guardada</h2><Link href={href('preferencias','actual')} className="sm-profile-link"><span><strong>{entry.contexto.marca.nombre}</strong><small>{Number.isFinite(Date.parse(preferences.updated))?new Date(preferences.updated).toLocaleDateString('es-CO'):''} · En este dispositivo</small></span><Icon name="arrow"/></Link><Link className="sm-primary" href={href('asistente')}>Elegir nuevas preferencias<Icon name="plus"/></Link></section></>
  return <><Title title={entry.contexto.marca.nombre} back="preferencias"/><div className="sm-preferences-detail">{questions.map((q,i)=><section className="sm-preference-group" key={q.title}><h3>{q.title}</h3>{i===3?<div className="sm-strength"><output>{preferences.answers[3][0]||'3'}</output><input aria-label="Intensidad guardada" type="range" readOnly min="1" max="5" value={preferences.answers[3][0]||'3'}/><div><span>Suave</span><span>Intenso</span></div></div>:<div className="sm-answer-chips">{q.options.map((option,index)=><span key={option} data-selected={preferences.answers[i].includes(option)}><img src={`/smart-menu/emoji/${choiceImages[i][index]}`} alt=""/>{option.slice(option.indexOf(' ')+1)}</span>)}</div>}</section>)}<button className="sm-text-button" onClick={()=>{try{localStorage.removeItem(keyFor(entry));setPreferences(null)}catch{}}}>Borrar preferencias</button></div><div className="sm-preferences-footer"><Link className="sm-primary" href={href('asistente')}>Editar preferencias</Link></div></>
}

const slides = [
  ['onboarding-menu.png','El menú, a tu manera','Explora los platos del restaurante y encuentra algo que te encante.'],
  ['robot.png','Una ayuda para elegir','Habla con Mi mesero para recibir recomendaciones y añadir platos a tu pedido.'],
  ['onboarding-order.png','Sigue tu pedido','Consulta cuándo reciben tu comanda, comienzan a prepararla y la entregan.'],
  ['onboarding-favorites.png','Recuerda tus favoritos','Con tu cuenta puedes guardar platos y consultar tus pedidos anteriores.'],
]
export function SmartAbout({onDone}: {onDone?:()=>void}) {
  const [slide,setSlide] = useState(0)
  const { href } = useSmartRoute()
  const current = slides[slide]
  return <section className="sm-journey sm-intro"><h2 className="sm-home-title">Conoce tu menú</h2><Recorrido ilustracion={`/smart-menu/${current[0]}`} diapositivas={{actual:slide,total:slides.length,ir:setSlide}} titulo={current[1]} texto={current[2]} acciones={<>{slide < 3 ? <button className="sm-primary" onClick={() => setSlide(slide + 1)}>Continuar<Icon name="arrow"/></button> : <button className="sm-primary" onClick={onDone}>Explorar el menú<Icon name="arrow"/></button>}<button className="sm-text-button" onClick={onDone}>Omitir introducción</button></>}/></section>
}
const help = [
  { name: 'Mi cuenta', icon: 'user' as const, articles: [['¿Para qué sirve mi cuenta?', 'Tu cuenta permite guardar favoritos y consultar el historial de pedidos realizados con ella. Puedes registrarte desde Mi cuenta.'], ['¿Cómo cierro mi sesión?', 'Entra a Mi cuenta y selecciona Cerrar sesión. Puedes volver a entrar cuando quieras.']] },
  { name: 'Pedidos', icon: 'bag' as const, articles: [['¿Cómo hago un pedido?', 'Elige un plato, indica la cantidad y agrégalo a tu pedido. Revisa el carrito y pulsa Confirmar pedido para enviarlo a cocina.'], ['¿Puedo cambiar un plato?', 'Antes de confirmar puedes cambiar cantidades o eliminar tus platos del carrito. Después de enviarlo, habla con tu mesero: los platos que ya están en preparación no se pueden modificar.'], ['¿Dónde veo el estado?', 'En Pedido actual o Mis pedidos puedes abrir el seguimiento. Se actualiza con los estados de cocina: recibido, en preparación, listo y entregado.']] },
  { name: 'Pagos', icon: 'plate' as const, articles: [['¿Cómo pido la cuenta?', 'Desde el seguimiento de tu pedido puedes pedir la cuenta. Tu mesero recibirá la solicitud y te ayudará a completar el pago.'], ['¿Puedo dividir la cuenta?', 'En Pedir la cuenta puedes consultar tu consumo o un reparto en partes iguales. Confirma el reparto final con tu mesero.']] },
  { name: 'Preferencias y favoritos', icon: 'heart' as const, articles: [['¿Cómo guardo un plato?', 'Con tu cuenta abierta, pulsa el corazón de un plato. Lo encontrarás en Favoritos.'], ['¿Cómo recibo recomendaciones?', 'Abre Mi mesero y cuéntale qué te apetece. Puedes pedirle otras opciones o añadir su recomendación al pedido.']] },
  { name: 'El restaurante', icon: 'bell' as const, articles: [['¿Cómo solicito ayuda?', 'Si abriste el menú de una mesa, puedes usar Llamar al mesero desde el menú o el seguimiento de tu pedido.'], ['¿Cómo consulto alérgenos?', 'Revisa la información del plato y confirma ingredientes y posibles trazas con el personal antes de pedir.']] },
]
export function SmartHelp() {
  const [category,setCategory] = useState<number | null>(null)
  const [article,setArticle] = useState<number | null>(null)
  const selected = category === null ? null : help[category]
  const content = article === null ? null : selected?.articles[article]
  return <><Title title="Ayuda"/>{selected && <button className="sm-text-button" onClick={() => article === null ? setCategory(null) : setArticle(null)}><Icon name="back"/>Volver</button>}{content ? <article className="sm-help-article"><h1>{content[0]}</h1><p>{content[1]}</p></article> : <><h1 className="sm-home-title">{selected?.name || '¿Cómo podemos ayudarte?'}</h1><div className="sm-help-list">{selected ? selected.articles.map((a,i) => <button key={a[0]} onClick={() => setArticle(i)}>{a[0]}<Icon name="arrow"/></button>) : help.map((c,i) => <button key={c.name} onClick={() => setCategory(i)}><Icon name={c.icon}/><span>{c.name}</span><Icon name="arrow"/></button>)}</div></>}</>
}
