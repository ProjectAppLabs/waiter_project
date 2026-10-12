// «Iniciar sesión» lleva al inicio de sesión universal de Waiter, por donde entran todos. En producción está en el mismo
// dominio que la landing (waiter.projectapp.co/login); en desarrollo, en el POS local.
export const INICIAR_SESION = process.env.NEXT_PUBLIC_LOGIN_URL
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000/login' : '/login')
