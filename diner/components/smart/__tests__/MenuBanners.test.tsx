import {render,screen,fireEvent} from '@testing-library/react'
import {MenuBanners} from '../MenuBanners'
import {useDinerStore} from '@/lib/stores/dinerStore'
jest.mock('next/navigation',()=>({useRouter:()=>({push:jest.fn()})}))
// Falla si el enlace del banner pierde la mesa o si el banner de categoría navega en vez de filtrar la carta.
it('keeps the table in product links and filters categories without leaving the menu',()=>{
 useDinerStore.setState({keys:{rest:'demo',venue:'sala',token:'mesa8'}})
 const category=jest.fn()
 const base={layout:'notice' as const,title:'Combo del día',subtitle:'',button:'Ver combo',image:'',theme:'amber' as const,active:true}
 render(<MenuBanners dishes={[]} onCategory={category} banners={[{...base,target:'product',targetId:30},{...base,title:'Bebidas',target:'category',targetId:2}]}/>)
 expect(screen.getByRole('link',{name:/Combo del día/})).toHaveAttribute('href','/demo/sala/t/mesa8/plato/30')
 fireEvent.click(screen.getByRole('button',{name:/Bebidas/}));expect(category).toHaveBeenCalledWith(2)
})
