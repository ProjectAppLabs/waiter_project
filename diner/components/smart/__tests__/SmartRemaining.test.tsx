import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {SmartFeedback} from '../SmartFeedback'
import {SmartPassword} from '../SmartPassword'
import {SmartWallet} from '../SmartWallet'
import {http} from '@/lib/services/api'
import {useDinerStore} from '@/lib/stores/dinerStore'
const push=jest.fn()
jest.mock('next/navigation',()=>({useRouter:()=>({push}),useSearchParams:()=>new URLSearchParams()}))
const initial=useDinerStore.getState()
beforeEach(()=>{
 useDinerStore.setState(initial,true)
 useDinerStore.setState({keys:{rest:'demo',venue:'salon',token:null},account:{id:'account',nombre:'Ana',correo:'ana@example.invalid',verificada:true,tieneClave:true}})
 localStorage.clear();push.mockClear()
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(()=>jest.restoreAllMocks())
// Falla si se agradece la opinión cuando el servidor la rechazó o si no se envían el comentario y las notas por plato.
it('saves feedback only after the server accepts the selected dishes and comment',async()=>{
 jest.spyOn(http,'get').mockResolvedValue({data:{feedback:null,items:[{product_id:3,name:'Plato',qty:1}]}})
 const put=jest.spyOn(http,'put').mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({data:{}})
 render(<SmartFeedback id="order"/>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Valorar mi experiencia'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Valorar mi experiencia'}))
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 fireEvent.change(screen.getByLabelText('Tu comentario (opcional)'),{target:{value:'Llegó frío'}})
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 fireEvent.click(within(screen.getByRole('group',{name:'Valorar Plato'})).getByRole('button',{name:'2: Mala'}))
 fireEvent.click(screen.getByRole('button',{name:'Enviar mi opinión'}))
 await screen.findByText('Sin conexión')
 expect(screen.queryByText('¡Gracias por compartir!')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enviar mi opinión'}))
 await screen.findByText('¡Gracias por compartir!')
 expect(put).toHaveBeenLastCalledWith('/api/v1/pedidos/order/opinion/',{rating:3,comment:'Llegó frío',dishes:{3:2}})
})
// Falla si el inicio de sesión no usa la API, no instala la cuenta autenticada o no lleva a la cuenta.
it('logs in with the API and installs the authenticated account and history',async()=>{
 const account={id:'verified',nombre:'Ana',correo:'ana@example.invalid',verificada:true}
 const post=jest.spyOn(http,'post').mockResolvedValue({data:{cuenta:account,pedidos:[]}})
 render(<SmartPassword login/>)
 fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:account.correo}})
 fireEvent.change(screen.getByLabelText('Contraseña',{exact:true}),{target:{value:'Una clave privada 42'}})
 fireEvent.click(screen.getByRole('button',{name:'Entrar'}))
 await waitFor(()=>expect(push).toHaveBeenCalledWith('/demo/salon/cuenta'))
 expect(post).toHaveBeenCalledWith('/api/v1/cuenta/entrar/',{correo:account.correo,clave:'Una clave privada 42'})
 expect(useDinerStore.getState().account?.id).toBe('verified')
})
// Falla si la billetera de prueba guarda el número completo o el CVV, o si no permite eliminar la tarjeta.
it('stores only demonstration card metadata, never PAN or CVV, and can remove it',async()=>{
 render(<SmartWallet/>)
 fireEvent.click(screen.getByRole('button',{name:'Añadir tarjeta de prueba'}))
 fireEvent.click(screen.getByRole('button',{name:'Guardar tarjeta de prueba'}))
 await waitFor(()=>expect(screen.getByText('TARJETA DE PRUEBA')).toBeInTheDocument())
 const cards=JSON.parse(localStorage.getItem('smart-menu:demo-cards:demo:salon:account')||'[]')
 expect(Object.keys(cards[0]).sort()).toEqual(['brand','expiry','holder','id','last4'])
 expect(JSON.stringify(cards)).not.toContain('4242424242424242')
 fireEvent.click(screen.getByRole('button',{name:'Eliminar tarjeta'}))
 expect(screen.getByText('Aún no tienes tarjetas')).toBeInTheDocument()
})

// Falla si quitar una valoración envía un cero inválido o inventa una opinión del plato.
it('allows clearing a dish rating before saving',async()=>{
 jest.spyOn(http,'get').mockResolvedValue({data:{feedback:null,items:[{product_id:3,name:'Plato',qty:1}]}})
 const put=jest.spyOn(http,'put').mockResolvedValue({data:{}})
 render(<SmartFeedback id="order"/>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Valorar mi experiencia'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Valorar mi experiencia'}))
 fireEvent.click(screen.getByRole('button',{name:'5: Excelente'}))
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}))
 const rating=within(screen.getByRole('group',{name:'Valorar Plato'})).getByRole('button',{name:'5: Excelente'})
 fireEvent.click(rating)
 fireEvent.click(rating)
 fireEvent.click(screen.getByRole('button',{name:'Enviar mi opinión'}))
 await screen.findByText('¡Gracias por compartir!')
 expect(put).toHaveBeenCalledWith('/api/v1/pedidos/order/opinion/',{rating:5,comment:'',dishes:{}})
})

// Falla si se muestra el formulario de nueva contraseña sin verificar antes el correo con un enlace.
it('requires an email verification link before displaying a new-password form',async()=>{
 const post=jest.spyOn(http,'post').mockResolvedValue({data:{ok:true}})
 render(<SmartPassword/>)
 expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enviar enlace de verificación'}))
 await screen.findByText('Enlace enviado. Tu contraseña todavía no ha cambiado.')
 expect(post).toHaveBeenCalledWith('/api/v1/cuenta/clave/',{})
 expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
})
