import {http} from './api'
export type OnlineMethod = 'BANCOLOMBIA_TRANSFER' | 'BANCOLOMBIA_QR' | 'NEQUI' | 'CARD'
export interface OnlinePayment {
  id:string; order_id?:string; reference:string; status:string; method:OnlineMethod; amount_in_cents:number; environment:'test'|'prod'
  reconciled:boolean; needs_review:boolean; challenge_html?:string|null; card_brand?:string; qr_image:string|null; redirect_url:string|null
}
export interface PaymentContext {
  available:boolean; attempt:OnlinePayment|null; other_payment_pending:boolean; amount_in_cents?:number|null
  provider?:string; public_key?:string; environment?:'test'|'prod'; methods?:OnlineMethod[]
  acceptance?:{token:string;url:string}; personal_data?:{token:string;url:string}
}
const path=(session:string)=>`/api/v1/sesiones/${session}/pagos/`
export const paymentContext=async(session:string)=>(await http.get<PaymentContext>(path(session),{timeout:25000})).data
export const createPayment=async(session:string,data:Record<string,unknown>)=>(await http.post<OnlinePayment>(path(session),data,{timeout:45000})).data
export const readPayment=async(session:string,id:string)=>(await http.get<OnlinePayment>(`${path(session)}${id}/`,{timeout:25000})).data

// Card data goes directly to Wompi. Never send PAN/CVC to our API or persist it in a store.
export async function tokenizeCard(environment:'test'|'prod',publicKey:string,card:Record<string,string>):Promise<string> {
  const host=environment==='test'?'https://sandbox.wompi.co/v1':'https://production.wompi.co/v1'
  const response=await fetch(`${host}/tokens/cards`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${publicKey}`},body:JSON.stringify(card),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw new Error('No pudimos validar la tarjeta. Revisa sus datos e intenta otra vez.')
  const result=await response.json()
  if(result.status!=='CREATED'||typeof result.data?.id!=='string')throw new Error('Wompi no pudo validar la tarjeta.')
  return result.data.id
}

export const finishPaymentTest=async(session:string,id:string)=>{await http.delete(`${path(session)}${id}/`)}

// ---- Anticipo de una reserva: el token del enlace es la llave; no hay sesión ni cookie de comensal.
export interface PublicReservation { code:string; customer:string; date:string; time_label:string; people:number; table_number:number; table_numbers?:number[]
  state:'confirmed'|'seated'|'no_show'|'cancelled'; deposit_state:'none'|'pending'|'paid'; amount_in_cents:number }
export interface ReservationPayContext extends PaymentContext { reservation:PublicReservation }
const reservationPath=(rest:string,venue:string,token:string)=>`/api/v1/${rest}/${venue}/reservas/${encodeURIComponent(token)}/pagos/`
export const reservationPayContext=async(rest:string,venue:string,token:string)=>(await http.get<ReservationPayContext>(reservationPath(rest,venue,token),{timeout:25000})).data
export const createReservationPayment=async(rest:string,venue:string,token:string,data:Record<string,unknown>)=>(await http.post<OnlinePayment>(reservationPath(rest,venue,token),data,{timeout:45000})).data
export const readReservationPayment=async(rest:string,venue:string,token:string,id:string)=>(await http.get<OnlinePayment>(`${reservationPath(rest,venue,token)}${id}/`,{timeout:25000})).data
export const finishReservationPaymentTest=async(rest:string,venue:string,token:string,id:string)=>{await http.delete(`${reservationPath(rest,venue,token)}${id}/`)}
