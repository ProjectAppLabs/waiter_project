import {fireEvent,render,screen} from '@testing-library/react'
import {SmartOnlinePay} from '../SmartOnlinePay'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {paymentContext,createPayment,tokenizeCard} from '@/lib/services/payments'

jest.mock('@/lib/services/payments',()=>({paymentContext:jest.fn(),createPayment:jest.fn(),readPayment:jest.fn(),tokenizeCard:jest.fn()}))
jest.mock('../SmartMenu',()=>({Title:({title}:{title:string})=><h1>{title}</h1>,money:(n:number)=>`$${n}`,useSmartRoute:()=>({go:jest.fn()})}))
const initial=useDinerStore.getState()
const context={available:true,attempt:null,other_payment_pending:false,environment:'test',public_key:'pub_test_dummy',amount_in_cents:5105100,methods:['BANCOLOMBIA_TRANSFER','BANCOLOMBIA_QR','NEQUI','CARD'],acceptance:{token:'terms',url:'https://wompi.co/terms'},personal_data:{token:'personal',url:'https://wompi.co/privacy'}}
beforeEach(()=>{jest.clearAllMocks();useDinerStore.setState(initial,true);useDinerStore.setState({session:{id:'session'} as never,ensureSession:jest.fn().mockResolvedValue({id:'session'})});jest.mocked(paymentContext).mockResolvedValue(context as never)})
async function consent(){await screen.findByLabelText('Correo para el pago');fireEvent.change(screen.getByLabelText('Correo para el pago'),{target:{value:'test@example.com'}});for(const box of screen.getAllByRole('checkbox'))fireEvent.click(box)}
// Falla si el QR se genera sin consentimiento o por un monto distinto del que ve el comensal.
it('requires explicit consent and requests a dynamic QR for the displayed amount',async()=>{
 jest.mocked(createPayment).mockResolvedValue({id:'payment',status:'PENDING',method:'BANCOLOMBIA_QR',amount_in_cents:5105100,environment:'test',reference:'waiter-test',qr_image:'PHN2Zy8+'} as never)
 render(<SmartOnlinePay/>);await screen.findByLabelText('Correo para el pago');expect(screen.getByRole('button',{name:/Generar QR/})).toBeDisabled();await consent()
 fireEvent.click(screen.getByRole('button',{name:/Generar QR/}));await screen.findByRole('img',{name:/QR para pagar/})
 expect(createPayment).toHaveBeenCalledWith('session',expect.objectContaining({method:'BANCOLOMBIA_QR',expected_amount_in_cents:5105100,accepted:true,personal_data_accepted:true}))
 expect(screen.getByText('Esperando tu pago')).toBeInTheDocument()
})
// Falla si tras un fallo de red se puede volver a crear el pago (cobro doble) en vez de consultarlo.
it('after a network failure offers reconciliation instead of resubmitting',async()=>{
 jest.mocked(createPayment).mockRejectedValue(new Error('Sin conexión'));render(<SmartOnlinePay/>);await consent()
 fireEvent.click(screen.getByRole('button',{name:/Generar QR/}));await screen.findByRole('button',{name:'Consultar si se creó el pago'})
 expect(screen.queryByRole('button',{name:/Generar QR/})).not.toBeInTheDocument();expect(createPayment).toHaveBeenCalledTimes(1)
})
// Falla si la vista previa del diseño consulta o crea pagos reales.
it('does not contact any payment API in a design preview',async()=>{
 useDinerStore.setState({preview:{} as never});render(<SmartOnlinePay/>);await screen.findByText(/aún no ha habilitado/)
 expect(paymentContext).not.toHaveBeenCalled();expect(createPayment).not.toHaveBeenCalled()
})
// Falla si el número de tarjeta o el CVV llegan a nuestra API en vez de solo el token de Wompi.
it('tokenizes cards with Wompi and never sends raw card fields to our payment API',async()=>{
 jest.mocked(tokenizeCard).mockResolvedValue('tok_test_safe');jest.mocked(createPayment).mockResolvedValue({id:'p',status:'APPROVED',method:'CARD',environment:'test',amount_in_cents:5105100} as never)
 render(<SmartOnlinePay/>);await consent();fireEvent.click(screen.getByRole('button',{name:/Tarjeta Crédito/}))
 for(const [label,value] of [['Nombre del titular','Test User'],['Número de tarjeta','4242424242424242'],['Mes','12'],['Año','30'],['CVV','123']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'Pagar $51051'}));await screen.findByText('Prueba aprobada')
 expect(tokenizeCard).toHaveBeenCalled();const body=jest.mocked(createPayment).mock.calls[0][1];expect(body.token).toBe('tok_test_safe');expect(JSON.stringify(body)).not.toContain('4242424242424242');expect(body).not.toHaveProperty('cvc')
})

// Falla si el reto del banco se carga sin aislar en el iframe o si se da el pago por aprobado.
it('isolates a bank challenge from our page and never treats it as approval',async()=>{
 jest.mocked(paymentContext).mockResolvedValue({...context,attempt:{id:'payment',method:'CARD',status:'PENDING',environment:'test',amount_in_cents:5105100,challenge_html:'<p>Bank challenge</p>'}} as never)
 render(<SmartOnlinePay/>);const frame=await screen.findByTitle('Verificación de seguridad de tu banco')
 expect(frame).toHaveAttribute('sandbox','allow-scripts allow-forms')
 expect(frame).not.toHaveAttribute('src')
 expect(screen.getByText('Esperando tu pago')).toBeInTheDocument()
})
