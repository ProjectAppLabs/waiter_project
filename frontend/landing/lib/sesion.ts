// «Iniciar sesión» lleva al inicio de sesión universal de Waiter, por donde entran todos. La landing y el POS son la misma
// app: es /login del mismo host (waiter.projectapp.co/login), también en desarrollo.
export const INICIAR_SESION = process.env.NEXT_PUBLIC_LOGIN_URL || '/login'
