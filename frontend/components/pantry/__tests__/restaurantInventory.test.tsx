import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { messages } from '@/lib/i18n/messages'
import { RecipeEditor } from '@/components/pantry/RecipeEditor'
import { InventoryControl } from '@/components/pantry/InventoryControl'
import { getRecipe, updateRecipe, getInventory, moveInventory } from '@/lib/services/restaurantInventory'
import type { Ingredient } from '@/lib/domain/pantry'
jest.mock('@/lib/services/restaurantInventory',()=>({getRecipe:jest.fn(),updateRecipe:jest.fn(),getInventory:jest.fn(),moveInventory:jest.fn(),inventorySettings:jest.fn()}))
const ingredient:Ingredient={id:1,name:'Carne',category:'meat',qty:2,uomId:10,uomName:'kg',level:'low',status:'request',supplierId:null,supplierName:null,hasImage:false,min:1,max:5}
const recipe={id:2,bom_id:3,yield:1,lines:[{ingredientId:1,qty:.2,uomId:10}],servings:7,cost:4000,limiting:['Carne'],ingredients:[{id:1,name:'Carne',qty:.2,uom_id:10,uom:'kg',stock:2,pending:.6,free:1.4,servings:7,cost:4000}]}
const inventory={stock:2,pending:.6,cost:20000,min:1,max:5,uom:'kg',history:[]}
const wrap=(ui:React.ReactElement)=>render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
beforeEach(()=>{jest.clearAllMocks();(getRecipe as jest.Mock).mockResolvedValue(recipe);(getInventory as jest.Mock).mockResolvedValue(inventory)})
// Falla si no se ve el ingrediente que limita las porciones o si editar la receta crea otro plato.
it('shows the limiting ingredient and edits quantities for a batch without making a new dish',async()=>{
 const refresh=jest.fn().mockResolvedValue(undefined)
 ;(updateRecipe as jest.Mock).mockResolvedValue({...recipe,yield:10})
 wrap(<RecipeEditor dish={{id:2,name:'Hamburguesa'}} ingredients={[ingredient]} units={[]} mayEdit onClose={jest.fn()} onSaved={refresh}/> )
 await screen.findByText('7 platos')
 expect(screen.getByText('1,4')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Editar receta'}))
 fireEvent.change(screen.getByLabelText('Porciones de la receta'),{target:{value:'10'}})
 fireEvent.change(screen.getByLabelText('Cantidad 1'),{target:{value:'2'}})
 fireEvent.click(screen.getByRole('button',{name:'Guardar receta'}))
 await waitFor(()=>expect(refresh).toHaveBeenCalled())
 expect(updateRecipe).toHaveBeenCalledWith(2,[{ingredientId:1,qty:2,uomId:10}],10,3)
})
// Falla si se registra un movimiento sin motivo o si el reintento tras un fallo usa otra clave y lo duplica.
it('requires a movement reason and reuses the request key after a failed response',async()=>{
 ;(moveInventory as jest.Mock).mockRejectedValueOnce(new Error('Se perdió la conexión')).mockResolvedValue({...inventory,stock:3})
 wrap(<InventoryControl ingredient={ingredient} mayEdit onClose={jest.fn()} onSaved={jest.fn().mockResolvedValue(undefined)}/> )
 await screen.findByRole('button',{name:'Registrar movimiento'})
 fireEvent.change(screen.getByLabelText('Cantidad del movimiento'),{target:{value:'1'}})
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimiento'}))
 await screen.findByText('Escribe una cantidad válida y el motivo o referencia.')
 expect(moveInventory).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Motivo o referencia'),{target:{value:'Factura 101'}})
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimiento'}))
 await screen.findByText('Se perdió la conexión')
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimiento'}))
 await waitFor(()=>expect(moveInventory).toHaveBeenCalledTimes(2))
 const calls=(moveInventory as jest.Mock).mock.calls
 expect(calls[0]).toEqual(calls[1])
 expect(calls[0].slice(0,4)).toEqual([1,'receipt',1,'Factura 101'])
})
