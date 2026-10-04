import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {SmartCart,SmartStatus} from '../SmartOrder'
import {useDinerStore} from '@/lib/stores/dinerStore'
const push=jest.fn()
jest.mock('next/navigation',()=>({useRouter:()=>({push})}))
const initial=useDinerStore.getState()
beforeEach(()=>{jest.clearAllMocks();useDinerStore.setState(initial,true);useDinerStore.setState({keys:{rest:'demo',venue:'salon',token:'mesa8'},cart:{lineas:[{id:1,producto_id:3,nombre:'Arepa',cantidad:1,precio:12000,subtotal:12000,mio:true,comensal:'ana'}],total:12000,mio:12000} as never});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
// Falla si con prepago el carrito envía a cocina en vez de llevar al pago tras confirmar.
it('continues from the cart to payment rather than reporting a kitchen submission',async()=>{
 const confirm=jest.fn().mockResolvedValue('order');useDinerStore.setState({confirm})
 render(<SmartCart/>);fireEvent.click(screen.getByRole('button',{name:'Continuar al pago'}));const dialog=screen.getByRole('dialog')
 expect(within(dialog).getByText(/después de confirmar el pago/)).toBeInTheDocument();fireEvent.click(within(dialog).getByRole('button',{name:'Continuar al pago'}))
 await waitFor(()=>expect(push).toHaveBeenCalledWith('/demo/salon/t/mesa8/pago'))
 expect(confirm).toHaveBeenCalledWith(false, {notas:'',alergenos:''});expect(screen.queryByText('Enviar a cocina')).not.toBeInTheDocument()
})
// Falla si un pedido pendiente de pago muestra la línea de preparación o no lleva a pagar.
it('shows pending payment without a preparation timeline',()=>{
 useDinerStore.setState({order:{id:'order',estado:'pendiente_pago',total:12000,impuestos:0} as never,refreshOrder:jest.fn()})
 render(<SmartStatus id="order"/>);expect(screen.getByRole('heading',{name:'Tu pedido espera el pago'})).toBeInTheDocument();expect(screen.queryByText('En preparación')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Continuar al pago'}));expect(push).toHaveBeenCalledWith('/demo/salon/t/mesa8/pago')
})

// Falla si no se precargan los alérgenos del perfil, no se envían las notas o la edición cambia el perfil.
it('prefills profile allergens and sends this order notes and edits',async()=>{
 const confirm=jest.fn().mockResolvedValue('order')
 useDinerStore.setState({confirm,account:{id:'ana',nombre:'Ana',correo:'ana@example.com',verificada:true,alergenos:'Maní'}})
 render(<SmartCart/>);fireEvent.click(screen.getByRole('button',{name:'Continuar al pago'}))
 const dialog=screen.getByRole('dialog')
 expect(within(dialog).getByLabelText('Alergias y alérgenos (opcional)')).toHaveValue('Maní')
 fireEvent.change(within(dialog).getByLabelText('Notas para tus platos (opcional)'),{target:{value:'Salsa aparte'}})
 fireEvent.change(within(dialog).getByLabelText('Alergias y alérgenos (opcional)'),{target:{value:'Maní y huevo'}})
 fireEvent.click(within(dialog).getByRole('button',{name:'Continuar al pago'}))
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith(false,{notas:'Salsa aparte',alergenos:'Maní y huevo'}))
 expect(useDinerStore.getState().account?.alergenos).toBe('Maní')
})
