import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {ShareLocation,CouponField} from '../SmartBenefits'
import {applyCoupon} from '@/lib/services/api'
import {useDinerStore} from '@/lib/stores/dinerStore'
jest.mock('@/lib/services/api',()=>({applyCoupon:jest.fn(),getRewards:jest.fn()}))
jest.mock('@/lib/stores/dinerStore',()=>({useDinerStore:Object.assign(jest.fn(),{setState:jest.fn()})}))
jest.mock('../SmartHome',()=>({SmartHeader:()=>null}))
jest.mock('../SmartMenu',()=>({Icon:()=>null,money:(n:number)=>String(n),useSmartRoute:()=>({href:(s:string)=>'/'+s})}))
const location={direccion:'Calle 10',latitud:6,longitud:-75}
afterEach(()=>jest.clearAllMocks())
// Falla si la distancia no sale de las coordenadas del dispositivo o si se pide la ubicación más de una vez.
it('uses real device coordinates to show distance without transmitting them',()=>{
 Object.defineProperty(window,'isSecureContext',{value:true,configurable:true})
 const read=jest.fn(cb=>cb({coords:{latitude:6,longitude:-75}}))
 Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:read},configurable:true})
 const located=jest.fn()
 render(<ShareLocation venue={location} onLocated={located} onManual={jest.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 expect(located).toHaveBeenCalledWith(0)
 expect(read).toHaveBeenCalledTimes(1)
})
// Falla si sin HTTPS no se avisa, se inventa una ubicación o deja de funcionar la opción manual.
it('keeps manual selection usable when location requires HTTPS',()=>{
 Object.defineProperty(window,'isSecureContext',{value:false,configurable:true})
 const manual=jest.fn(),located=jest.fn()
 render(<ShareLocation venue={location} onLocated={located} onManual={manual}/>)
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 expect(screen.getByRole('alert')).toHaveTextContent('HTTPS')
 expect(located).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Introducir una ubicación'}))
 expect(manual).toHaveBeenCalledTimes(1)
})
// Falla si al negar el permiso de ubicación no hay aviso o se reporta una distancia inventada.
it('handles denied permission without inventing a location',()=>{
 Object.defineProperty(window,'isSecureContext',{value:true,configurable:true})
 Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(_ok:unknown,fail:(e:{code:number})=>void)=>fail({code:1})},configurable:true})
 const located=jest.fn()
 render(<ShareLocation venue={null} onLocated={located} onManual={jest.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 expect(screen.getByRole('alert')).toHaveTextContent('No se compartió')
 expect(located).not.toHaveBeenCalled()
})
// Falla si el cupón no se normaliza, si el carrito no viene del servidor o si no se recalcula la cuenta.
it('applies only the server response and refreshes the quoted bill',async()=>{
 const refreshBill=jest.fn().mockResolvedValue(undefined)
 ;(useDinerStore as unknown as jest.Mock).mockReturnValue({cart:{},session:{id:'my-session'},refreshBill,preview:null,busy:false})
 const cart={descuento:{codigo:'FOOD20',porcentaje:20,monto:2000}}
 ;(applyCoupon as jest.Mock).mockResolvedValue(cart)
 render(<CouponField/>)
 fireEvent.change(screen.getByLabelText('Código de descuento'),{target:{value:'food20'}})
 fireEvent.click(screen.getByRole('button',{name:'Aplicar'}))
 await waitFor(()=>expect(refreshBill).toHaveBeenCalledTimes(1))
 expect(applyCoupon).toHaveBeenCalledWith('my-session','FOOD20')
 expect(useDinerStore.setState).toHaveBeenCalledWith({cart})
})
// Falla si un cupón rechazado por el POS se aplica igual o si no se muestra el motivo del rechazo.
it('keeps an invalid coupon unapplied and displays the POS validation',async()=>{
 ;(useDinerStore as unknown as jest.Mock).mockReturnValue({cart:{},session:{id:'s'},refreshBill:jest.fn(),preview:null,busy:false})
 ;(applyCoupon as jest.Mock).mockRejectedValue(new Error('Cupón vencido'))
 render(<CouponField/>)
 fireEvent.change(screen.getByLabelText('Código de descuento'),{target:{value:'OLD20'}})
 fireEvent.click(screen.getByRole('button',{name:'Aplicar'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Cupón vencido')
 expect(useDinerStore.setState).not.toHaveBeenCalled()
})
