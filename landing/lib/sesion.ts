// «Iniciar sesión» lleva al inicio de sesión universal de Waiter, por donde entran todos (en desarrollo, el POS local).
export const INICIAR_SESION = process.env.NEXT_PUBLIC_LOGIN_URL
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000/login' : 'https://waiter.projectapp.co/login')
