import {render,screen,fireEvent} from '@testing-library/react'
import {FirstVisitIntro} from '../FirstVisitIntro'
jest.mock('../SmartJourneys',()=>({SmartAbout:({onDone}:{onDone:()=>void})=><button onClick={onDone}>Omitir introducción</button>}))
// Falla si la introducción reaparece tras omitirla, si no guarda la cookie o si tapa un enlace directo.
it('remembers dismissal across visits but does not interrupt deep links',()=>{
 document.cookie='waiter_intro_demo_v1=; Max-Age=0; Path=/'
 const view=render(<FirstVisitIntro restaurant="demo" enabled={false}>Pedido</FirstVisitIntro>)
 expect(screen.getByText('Pedido')).toBeInTheDocument()
 view.rerender(<FirstVisitIntro restaurant="demo" enabled>Carta de mesa 8</FirstVisitIntro>)
 fireEvent.click(screen.getByText('Omitir introducción'))
 expect(screen.getByText('Carta de mesa 8')).toBeInTheDocument()
 expect(document.cookie).toContain('waiter_intro_demo_v1=1')
 view.unmount()
 render(<FirstVisitIntro restaurant="demo" enabled>Carta de mesa 8</FirstVisitIntro>)
 expect(screen.queryByText('Omitir introducción')).not.toBeInTheDocument()
 expect(screen.getByText('Carta de mesa 8')).toBeInTheDocument()
})
