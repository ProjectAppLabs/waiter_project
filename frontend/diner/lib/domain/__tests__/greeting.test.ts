import { momentOf, pickGreeting } from '@/lib/domain/greeting'

// Falla si el saludo vuelve a ser un «Hola» plano, si la frase no respeta la hora, si el nombre no entra en la frase
// o si el texto del administrador deja de mandar sobre el repertorio.
it('picks a time-aware phrase, stable for the same seed, with or without the first name', () => {
  expect([momentOf(6), momentOf(11), momentOf(12), momentOf(18), momentOf(19), momentOf(23)]).toEqual(['manana', 'manana', 'tarde', 'tarde', 'noche', 'noche'])
  expect(pickGreeting({ hour: 8, seed: 0 })).toBe('Buenos días')
  expect(pickGreeting({ hour: 8, seed: 0, name: 'Camila Rojas' })).toBe('Buenos días, Camila')
  expect(pickGreeting({ hour: 15, seed: 0.999 })).toBe('Tu mesa te esperaba')
  expect(pickGreeting({ hour: 21, seed: 0.5, name: 'Andrés' })).toBe(pickGreeting({ hour: 21, seed: 0.5, name: 'Andrés' }))
  expect(pickGreeting({ hour: 21, seed: 0.5, name: 'Andrés' })).toContain('Andrés')
  expect(pickGreeting({ hour: 21, seed: 0.5 })).not.toContain('{n}')
  expect(pickGreeting({ admin: ' Qué gusto verte ', name: 'Camila' })).toBe('Qué gusto verte, Camila')
  expect(pickGreeting({ admin: '' , hour: 21, seed: 0 })).toBe('Buenas noches')
})
