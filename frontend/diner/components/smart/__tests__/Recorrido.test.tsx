import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {factoryTree} from '@/components/plantillas/__tests__/helpers'
import {SmartAbout} from '../SmartJourneys'
import {SmartEmailEntry,SmartPasswordReset,SmartRegisteredAccount,SmartVerificationChannel} from '../SmartPassword'
import {SmartLocation} from '../SmartEntry'
import {SmartFeedback} from '../SmartFeedback'
import {PaidCelebration} from '../SmartBenefits'
import {http} from '@/lib/services/api'
import {DEFAULT_TEMPLATE} from '@/lib/domain/template'
import {useDinerStore} from '@/lib/stores/dinerStore'
import type {Entry,MenuTheme,OrderStatus} from '@/lib/types'

// Plan K, paquete C: las nueve pantallas de recorrido (la ubicación con sus tres pasos) se arman con el componente Recorrido y
// la plantilla de fábrica del contrato «recorrido» las reproduce exactamente.
jest.mock('next/navigation',()=>({useRouter:()=>({push:jest.fn()}),useSearchParams:()=>new URLSearchParams('token=enlace')}))
jest.mock('@/lib/services/api',()=>({...jest.requireActual('@/lib/services/api'),getVenueLocation:jest.fn(async()=>({direccion:'Calle 10 # 5-20',latitud:6.2,longitud:-75.5}))}))

const entry={banners:null,contexto:{restaurante:{slug:'demo',nombre:'Demo'},sede:{slug:'salon',nombre:'Salón'},mesa:{numero:8,token:'X'},
 marca:{nombre:'Casa Demo',lema:'Sabor de casa',logo:'/logo.png',saludo:'',mesero:'',bienvenida:'',color:'#6755A0',colorTexto:'#FFFFFF',colorSuave:'#EEEBF5',fuente:'Mulish',radio:16}},
 carta:{restaurante:'Casa Demo',categorias:[]}} as unknown as Entry
const paid={id:'a1b2c3d4e5',sesion:'s',estado:'pagado',total:64000,impuestos:0,intentos:1,recompensas:{tarjeta:null,codigo:'ABC',puntos:120,ganados:12,programa:'Puntos',valorPunto:1,minimoCanje:10}} as OrderStatus
const initial=useDinerStore.getState()
beforeEach(()=>{
 useDinerStore.setState(initial,true)
 useDinerStore.setState({keys:{rest:'demo',venue:'salon',token:null},entry,account:{id:'account',nombre:'Ana',correo:'ana@example.invalid',verificada:true,tieneClave:true},
  pendingAccount:{form:{correo:'ana@example.invalid',celular:''}} as never})
 jest.spyOn(http,'get').mockResolvedValue({data:{feedback:null,items:[{product_id:3,name:'Plato',qty:1}]}})
 jest.spyOn(http,'put').mockResolvedValue({data:{}})
 jest.spyOn(http,'post').mockResolvedValue({data:{ok:true}})
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(()=>jest.restoreAllMocks())

const boton=(name:string|RegExp)=>fireEvent.click(screen.getByRole('button',{name}))
type Pantalla={nombre:string;montar:()=>Promise<HTMLElement>;titulo:string;texto?:string;ilustracion?:string;puntos?:number;cuerpo?:string;acciones:number}
// Cada pantalla en su estado de recorrido: cómo llegar, qué título y qué partes (ilustración, puntos, contenido propio, acciones del pie) debe tener.
const PANTALLAS:Pantalla[]=[
 {nombre:'introducción de la primera visita',montar:async()=>render(<SmartAbout onDone={()=>undefined}/>).container,titulo:'El menú, a tu manera',texto:'Explora los platos',ilustracion:'/smart-menu/onboarding-menu.png',puntos:4,acciones:2},
 {nombre:'cuenta lista',montar:async()=>render(<SmartRegisteredAccount/>).container,titulo:'¡Tu cuenta está lista!',texto:'Hola, Ana. Ya puedes',ilustracion:'/smart-menu/stars.png',acciones:2},
 {nombre:'correo',montar:async()=>render(<SmartEmailEntry/>).container,titulo:'Empecemos por tu correo',texto:'Lo usarás',cuerpo:'form.sm-auth-form input[type="email"]',acciones:0},
 {nombre:'canal de verificación',montar:async()=>render(<SmartVerificationChannel/>).container,titulo:'¿Cómo prefieres verificarte?',texto:'Registro de demostración',cuerpo:'.sm-help-list button',acciones:1},
 {nombre:'éxito al restablecer la contraseña',montar:async()=>{
  const {container}=render(<SmartPasswordReset/>)
  fireEvent.change(screen.getByLabelText('Nueva contraseña'),{target:{value:'clave-segura-10'}})
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'),{target:{value:'clave-segura-10'}})
  boton('Guardar contraseña');await screen.findByText('Contraseña restablecida');return container},
  titulo:'Contraseña restablecida',texto:'Ya puedes entrar',ilustracion:'/smart-menu/password.png',acciones:1},
 {nombre:'ubicación: una nueva mesa',montar:async()=>render(<SmartLocation entry={entry} rescan/>).container,titulo:'Una nueva mesa, otra experiencia',texto:'Escanea el código QR',ilustracion:'/smart-menu/qr.png',acciones:2},
 {nombre:'ubicación: código de la mesa',montar:async()=>{
  const {container}=render(<SmartLocation entry={entry}/>)
  boton(/Código de tu mesa/);boton('Introducir código manualmente');return container},
  titulo:'Introduce el código de tu mesa',texto:'También puedes pegar',ilustracion:'/smart-menu/qr.png',cuerpo:'form input',acciones:0},
 {nombre:'ubicación: el local',montar:async()=>{
  const {container}=render(<SmartLocation entry={entry}/>)
  boton(/Elegir restaurante/);boton('Introducir una ubicación');boton(/Casa Demo/);await screen.findByText('Cómo llegar');return container},
  titulo:'Casa Demo',texto:'Calle 10 # 5-20',ilustracion:'/logo.png',cuerpo:'a.sm-text-button',acciones:2},
 {nombre:'éxito de la opinión',montar:async()=>{
  const {container}=render(<SmartFeedback id="order"/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Valorar mi experiencia'})).toBeEnabled())
  boton('Valorar mi experiencia');boton('Continuar');boton('Continuar')
  fireEvent.click(within(screen.getByRole('group',{name:'Valorar Plato'})).getByRole('button',{name:'2: Mala'}))
  boton('Enviar mi opinión');await screen.findByText('¡Gracias por compartir!');return container},
  titulo:'¡Gracias por compartir!',texto:'Tu opinión quedó guardada',ilustracion:'/smart-menu/stars.png',acciones:2},
 {nombre:'celebración del pago',montar:async()=>render(<PaidCelebration order={paid}/>).container,titulo:'¡Gracias por tu visita!',texto:'Tu pago fue registrado',ilustracion:'/smart-menu/payment.png',cuerpo:'button.sm-secondary',acciones:2},
]
const withFactory=()=>useDinerStore.setState({template:{...DEFAULT_TEMPLATE,tema:{version:2,componentes:{recorrido:{version:1,arbol:factoryTree('recorrido')}}} as unknown as MenuTheme}})

describe.each(PANTALLAS)('$nombre',(p)=>{
 // Falla si la pantalla deja de armarse con Recorrido dentro de su sección o pierde la ilustración, los puntos, el contenido propio o las acciones del pie.
 it('arma el recorrido con todas sus partes',async()=>{
  const container=await p.montar()
  const roots=container.querySelectorAll('.sm-journey > .sm-recorrido')
  expect(roots).toHaveLength(1)
  const root=roots[0]
  expect(root).not.toHaveAttribute('data-plantilla')
  expect(root.querySelector('h1')?.textContent).toBe(p.titulo)
  if(p.texto)expect(root.querySelector('h1 + p')?.textContent).toContain(p.texto)
  expect([...root.querySelectorAll('.sm-orbit-hero img')].map(i=>i.getAttribute('src'))).toEqual(p.ilustracion?[p.ilustracion]:[])
  expect(root.querySelectorAll('.sm-slide-dots button')).toHaveLength(p.puntos??0)
  expect(root.querySelector('.sm-journey-footer')?.children.length??0).toBe(p.acciones)
  if(p.cuerpo)expect(root.querySelector(p.cuerpo)).not.toBeNull()
 })

 // Falla si la plantilla de fábrica del recorrido, dibujada desde el árbol, difiere del JSX de la pantalla: el lenguaje dejaría de alcanzar para su diseño.
 it('dibuja lo mismo con la plantilla de fábrica',async()=>{
  const first=await p.montar()
  const factory=first.querySelector('.sm-recorrido')!.innerHTML
  cleanup()
  withFactory()
  const second=await p.montar()
  const root=second.querySelector('.sm-recorrido')!
  expect(root).toHaveAttribute('data-componente','recorrido')
  expect(root.innerHTML).toBe(factory)
 })
})
