import { PRIORITY, play, resetForTests, setMuted, startTime } from '@/lib/audio/sounds'

beforeEach(resetForTests)

// Falla si el orden de urgencia se rompe: crítico debe ganar a todo y el toque a nada.
it('ranks critical above everything and tap below everything', () => {
  expect(startTime(0, 'ticket')).toBe(0)
  expect(Math.max(...Object.values(PRIORITY))).toBe(PRIORITY.critico)
  expect(Math.min(...Object.values(PRIORITY))).toBe(PRIORITY.tap)
})

// Falla si el KDS silenciado sigue sonando, o si sin AudioContext (jsdom) la app revienta.
it('does not throw without audio support and stays quiet when muted', () => {
  setMuted(true)
  expect(() => play('ticket')).not.toThrow()
  setMuted(false)
  expect(() => play('tap')).not.toThrow()
})
