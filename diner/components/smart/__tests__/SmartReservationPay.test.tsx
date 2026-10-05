import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {SmartReservationPay} from '../SmartReservationPay'
import {createReservationPayment,reservationPayContext} from '@/lib/services/payments'
import {parseRoute,pathFor} from '@/lib/domain/route'
import type {Entry} from '@/lib/types'

jest.mock('@/lib/services/payments',()=>({reservationPayContext:jest.fn(),createReservationPayment:jest.fn(),readReservationPayment:jest.fn(),finishReservationPaymentTest:jest.fn(),tokenizeCard:jest.fn()}))
jest.mock('../SmartMenu',()=>({Icon:()=>null,money:(n:number)=>`$${n}`,useSmartRoute:()=>({href:(s:string)=>`/demo/salon/${s}`,go:jest.fn()})}))
const TOKEN='UFLe_VaK1Qx627Ebdh2IMtiA9lIBurnn'
const entry={contexto:{restaurante:{slug:'demo',nombre:'Demo'},sede:{slug:'salon',nombre:'Poblado'},mesa:null,marca:{nombre:'Burger House',logo:null}},carta:{restaurante:'Burger House',categorias:[]}} as unknown as Entry
const reservation={code:'RV101',customer:'Camila',date:'2030-10-18',time_label:'19:30',people:2,table_number:7,state:'confirmed',deposit_state:'pending',amount_in_cents:5000000}
const open={reservation,available:true,attempt:null,other_payment_pending:false,environment:'test',public_key:'pub_test_dummy',amount_in_cents:5000000,methods:['BANCOLOMBIA_QR','NEQUI','CARD'],acceptance:{token:'terms',url:'https://wompi.co/terms'},personal_data:{token:'personal',url:'https://wompi.co/privacy'}}
const page=()=>render(<SmartReservationPay entry={entry} rest="demo" venue="salon" token={TOKEN}/>)
beforeEach(()=>jest.clearAllMocks())

// Falla si el enlace deja de resolverse a su pantalla o pierde el token, y el cliente acaba en la carta sin poder pagar.
it('routes the payment link to its own screen with the token',()=>{
 expect(parseRoute(['reserva',TOKEN])).toEqual({token:null,screen:'reserva',id:TOKEN})
 expect(pathFor('demo','salon',null,'reserva',TOKEN)).toBe(`/demo/salon/reserva/${TOKEN}`)
})

// Falla si el cliente no reconoce su reserva, si el monto no es el del servidor, o si puede pagar sin aceptar las dos
// condiciones de Wompi.
it('shows the brand, the reservation and charges the server amount only after consent',async()=>{
 jest.mocked(reservationPayContext).mockResolvedValue(open as never)
 jest.mocked(createReservationPayment).mockResolvedValue({id:'p',status:'PENDING',method:'BANCOLOMBIA_QR',amount_in_cents:5000000,environment:'test',reference:'waiter-x',qr_image:'PHN2Zy8+'} as never)
 page()
 const ticket=await screen.findByRole('region',{name:'Tu reserva'})
 expect(within(ticket).getByText('Hola, Camila')).toBeInTheDocument()
 expect(within(ticket).getByRole('heading',{name:/18 de octubre/})).toBeInTheDocument()
 expect(within(ticket).getByText('19:30')).toBeInTheDocument()
 expect(screen.getByText('Burger House')).toBeInTheDocument()
 expect(screen.getByText('$50000')).toBeInTheDocument()
 expect(reservationPayContext).toHaveBeenCalledWith('demo','salon',TOKEN)
 const pay=screen.getByRole('button',{name:/Generar QR/});expect(pay).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Correo para el pago'),{target:{value:'camila@example.com'}})
 for(const box of screen.getAllByRole('checkbox'))fireEvent.click(box)
 fireEvent.click(pay)
 await screen.findByRole('img',{name:/QR para pagar/})
 expect(createReservationPayment).toHaveBeenCalledWith('demo','salon',TOKEN,expect.objectContaining({method:'BANCOLOMBIA_QR',expected_amount_in_cents:5000000,accepted:true,personal_data_accepted:true}))
})

// Falla si sin pasarela se enseñan medios de pago o un botón de pagar que no puede funcionar.
it('explains who to contact instead of offering methods when the restaurant has no gateway',async()=>{
 jest.mocked(reservationPayContext).mockResolvedValue({reservation,available:false,attempt:null,other_payment_pending:false,amount_in_cents:5000000} as never)
 page()
 expect(await screen.findByText(/Burger House aún no recibe pagos en línea/)).toBeInTheDocument()
 expect(screen.queryByRole('group',{name:'Medio de pago'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/Generar QR|Pagar/})).not.toBeInTheDocument()
})

// Falla si un anticipo ya pagado, una reserva cancelada o una sin costo siguen ofreciendo cobrar.
it.each([[{deposit_state:'paid'},'Tu anticipo ya está pagado'],[{state:'cancelled'},'Esta reserva ya no está activa'],[{deposit_state:'none',amount_in_cents:0},'Esta reserva no tiene costo']])('offers nothing to pay when %j',async(change,title)=>{
 jest.mocked(reservationPayContext).mockResolvedValue({reservation:{...reservation,...change},available:false,attempt:null,other_payment_pending:false,amount_in_cents:null} as never)
 page()
 expect(await screen.findByRole('heading',{name:title as string})).toBeInTheDocument()
 await waitFor(()=>expect(screen.queryByRole('group',{name:'Medio de pago'})).not.toBeInTheDocument())
 expect(createReservationPayment).not.toHaveBeenCalled()
})

// Falla si un enlace de pago sin token consulta la API en vez de mostrarse como inválido.
it('rejects a link without a token without calling the API',()=>{
 render(<SmartReservationPay entry={entry} rest="demo" venue="salon" token={null}/>)
 expect(screen.getByRole('alert')).toHaveTextContent('Este enlace de pago no es válido.')
 expect(reservationPayContext).not.toHaveBeenCalled()
})
