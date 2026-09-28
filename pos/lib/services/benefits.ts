import {callKw} from './odoo'
export interface Coupon {id?:number;name:string;code:string;percent:number;minimum:number;start:string;end:string;active:boolean}
export interface PointsSettings {name:string;spendPerPoint:number;valuePerPoint:number;minimumPoints:number}
// Plan N: lo que el comensal hace en el menú y le da un premio. El premio enlaza los otros dos tipos de promoción:
// un % de descuento en su próxima compra, un cupón de la pestaña Cupones o puntos del programa de la pestaña Puntos.
export type BenefitActionKey='cuenta'|'opinion'|'novedades'|'pago_en_linea'
export type BenefitReward='descuento'|'cupon'|'puntos'
export interface BenefitAction {action:BenefitActionKey;active:boolean;reward:BenefitReward;percent:number;couponId:number|null;points:number}
export interface BenefitsSettings {coupons:Coupon[];loyalty:PointsSettings|null;actions:BenefitAction[]}
export const benefitsSettings=(configId:number,coupon?:Coupon,loyalty?:PointsSettings,action?:BenefitAction)=>callKw<BenefitsSettings>('pos.config','waiter_benefits_settings',[[configId]],{coupon:coupon??null,loyalty:loyalty??null,action:action??null})
