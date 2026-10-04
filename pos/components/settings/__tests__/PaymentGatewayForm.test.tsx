import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {PaymentGatewayForm} from '../PaymentGatewayForm'
import {getPaymentGateways,savePaymentGateway} from '@/lib/services/paymentGateways'
jest.mock('@/lib/services/paymentGateways',()=>({getPaymentGateways:jest.fn(),savePaymentGateway:jest.fn(),testPaymentGateway:jest.fn()}))
const settings={provider:'wompi',live_available:false,methods:[],configurations:['test','prod'].map(environment=>({environment,enabled:false,public_key:'',configured:{private_key:false,events:false,integrity:false},payment_method_id:null,webhook_url:null,webhook_path:'/events/'}))}
beforeEach(()=>{jest.clearAllMocks();jest.mocked(getPaymentGateways).mockResolvedValue(settings as never);jest.mocked(savePaymentGateway).mockResolvedValue({...settings,configurations:settings.configurations.map(c=>({...c,configured:{private_key:true,events:true,integrity:true}}))} as never)})
// Falla si la llave privada no se guarda en pruebas, queda visible en el campo tras guardar o deja de ser tipo clave.
it('saves in sandbox and clears password inputs after successful save',async()=>{
 render(<PaymentGatewayForm methods={[]}/>);await screen.findByLabelText('Llave privada');fireEvent.change(screen.getByLabelText('Llave privada'),{target:{value:'prv_test_newsecret'}});fireEvent.click(screen.getByRole('button',{name:'Guardar credenciales'}))
 await waitFor(()=>expect(savePaymentGateway).toHaveBeenCalledWith(expect.objectContaining({environment:'test',private_key:'prv_test_newsecret'})))
 await waitFor(()=>expect(screen.getByLabelText('Llave privada')).toHaveValue(''))
 expect(screen.getByLabelText('Llave privada')).toHaveAttribute('type','password')
})
// Falla si se puede activar la pasarela en producción antes de que el servidor lo permita.
it('cannot activate production before the server allows it',async()=>{
 render(<PaymentGatewayForm methods={[]}/>);await screen.findByLabelText('Ambiente');fireEvent.change(screen.getByLabelText('Ambiente'),{target:{value:'prod'}})
 expect(screen.getByRole('checkbox')).toBeDisabled()
})
