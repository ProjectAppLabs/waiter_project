import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {MenuBannersForm} from '../MenuBannersForm'
import {callKw} from '@/lib/services/odoo'
jest.mock('@/lib/services/odoo',()=>({callKw:jest.fn()}))
jest.mock('@/lib/stores/authStore',()=>({useAuthStore:{getState:()=>({employee:{id:9,token:'session'}})}}))
jest.mock('@/lib/services/catalogAdmin',()=>({listProducts:async()=>[{id:20,variantId:30,name:'Combo almuerzo',available:true,dinerAttributes:{combo:[{}]}},{id:21,variantId:31,name:'Hamburguesa',available:true,dinerAttributes:{}}],listCategories:async()=>[{id:2,name:'Combos'}]}))
// Falla si el banner no se vincula a un combo (o a un plato) elegido de su propia lista, o si el modo del formulario se guarda.
it('shows image dimensions and saves a catalog combo destination with employee identity',async()=>{
 jest.mocked(callKw).mockResolvedValue({banners:[]})
 render(<MenuBannersForm configId={1}/>);fireEvent.click(await screen.findByRole('button',{name:'Añadir banner'}))
 expect(screen.getByText('1200 × 600 px (2:1)')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Vincular el banner a'),{target:{value:'plato'}})
 expect(Array.from((screen.getByLabelText('Plato') as HTMLSelectElement).options).map(o=>o.textContent)).toEqual(['Selecciona','Hamburguesa'])
 fireEvent.change(screen.getByLabelText('Vincular el banner a'),{target:{value:'combo'}})
 // Elegir «Un combo» lista solo los combos; «Un plato», solo los platos.
 expect(Array.from((screen.getByLabelText('Combo') as HTMLSelectElement).options).map(o=>o.textContent)).toEqual(['Selecciona','Combo almuerzo'])
 fireEvent.change(screen.getByLabelText('Combo'),{target:{value:'30'}})
 fireEvent.click(screen.getByRole('button',{name:'Guardar banners'}))
 await waitFor(()=>expect(callKw).toHaveBeenCalledWith('pos.config','waiter_banner_settings',[[1],9,'session',[expect.objectContaining({target:'product',targetId:30})]]))
 // El modo del formulario no viaja al servidor.
 expect((jest.mocked(callKw).mock.calls.at(-1)![2] as unknown[][])[3][0]).not.toHaveProperty('pick')

})
