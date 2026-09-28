import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {BenefitsForm} from '../BenefitsForm'
import {callKw} from '@/lib/services/odoo'
import type {BenefitsSettings} from '@/lib/services/benefits'
jest.mock('@/lib/services/odoo',()=>({callKw:jest.fn()}))
jest.mock('../MenuBannersForm',()=>({MenuBannersForm:({configId}:{configId:number})=>{const {createElement}=jest.requireActual('react');return createElement('h3',null,`Banners del menú ${configId}`)}}))

const actions:BenefitsSettings['actions']=[
 {action:'cuenta',active:true,reward:'descuento',percent:5,couponId:null,points:10},
 {action:'opinion',active:false,reward:'descuento',percent:5,couponId:null,points:10},
 {action:'novedades',active:false,reward:'descuento',percent:5,couponId:null,points:10},
 {action:'pago_en_linea',active:false,reward:'descuento',percent:5,couponId:null,points:10},
]
const settings=(over:Partial<BenefitsSettings>={}):BenefitsSettings=>({coupons:[{id:7,name:'Bienvenida',code:'HOLA10',percent:10,minimum:0,start:'',end:'',active:true},{id:8,name:'Viejo',code:'VIEJO',percent:20,minimum:0,start:'',end:'',active:false}],
 loyalty:{name:'Puntos Waiter',spendPerPoint:1000,valuePerPoint:10,minimumPoints:100},actions,...over})
afterEach(()=>jest.mocked(callKw).mockReset())

// Falla si la pestaña Acciones no lista las cuatro acciones del menú o no guarda el premio elegido (aquí, un cupón).
it('muestra las tres pestañas y guarda una acción que activa un cupón',async()=>{
 jest.mocked(callKw).mockResolvedValue(settings())
 render(<BenefitsForm configId={1}/>)
 expect(await screen.findByRole('heading',{name:'Cupones de descuento'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('tab',{name:'Puntos'}))
 expect(screen.getByRole('heading',{name:'Puntos de fidelización'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('tab',{name:'Acciones'}))
 expect(screen.getAllByRole('form').map(f=>f.getAttribute('aria-label'))).toEqual(['Crear y verificar su cuenta','Dejar su opinión de un pedido','Suscribirse a las novedades','Pagar su pedido en línea'])
 const opinion=screen.getByRole('form',{name:'Dejar su opinión de un pedido'})
 fireEvent.click(within(opinion).getByRole('switch',{name:'Premiar: Dejar su opinión de un pedido'}))
 fireEvent.change(within(opinion).getByLabelText('Premio'),{target:{value:'cupon'}})
 // Solo los cupones activos se pueden entregar.
 expect(within(within(opinion).getByLabelText('Cupón')).getAllByRole('option').map(o=>o.textContent)).toEqual(['Elige un cupón','HOLA10 · 10%'])
 fireEvent.change(within(opinion).getByLabelText('Cupón'),{target:{value:'7'}})
 fireEvent.click(within(opinion).getByRole('button',{name:'Guardar acción'}))
 await waitFor(()=>expect(callKw).toHaveBeenLastCalledWith('pos.config','waiter_benefits_settings',[[1]],{coupon:null,loyalty:null,
  action:{action:'opinion',active:true,reward:'cupon',percent:5,couponId:7,points:10}}))
 expect(await screen.findByRole('status')).toHaveTextContent('«Dejar su opinión de un pedido» guardada.')
})

// Falla si se puede guardar activa una acción cuyo premio no se puede entregar (sin cupón elegido o sin programa de puntos).
it('no deja guardar un premio imposible',async()=>{
 jest.mocked(callKw).mockResolvedValue(settings({loyalty:null}))
 render(<BenefitsForm configId={1}/>)
 fireEvent.click(await screen.findByRole('tab',{name:'Acciones'}))
 const cuenta=screen.getByRole('form',{name:'Crear y verificar su cuenta'})
 expect(within(cuenta).getByRole('option',{name:'Sumarle puntos'})).toBeDisabled()
 fireEvent.change(within(cuenta).getByLabelText('Premio'),{target:{value:'cupon'}})
 expect(within(cuenta).getByRole('alert')).toHaveTextContent('Elige un cupón activo de la pestaña Cupones.')
 expect(within(cuenta).getByRole('button',{name:'Guardar acción'})).toBeDisabled()
 expect(callKw).toHaveBeenCalledTimes(1)
})

// Falla si los banners dejan de estar en «Promociones» (se movieron desde Diseño del menú).
it('muestra los banners como otra pestaña de promociones',async()=>{
 jest.mocked(callKw).mockResolvedValue(settings())
 render(<BenefitsForm configId={1}/>)
 fireEvent.click(await screen.findByRole('tab',{name:'Banners'}))
 expect(screen.getByRole('heading',{name:'Banners del menú 1'})).toBeInTheDocument()
})
