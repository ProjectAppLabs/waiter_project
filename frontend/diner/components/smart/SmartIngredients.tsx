/* eslint-disable @next/next/no-img-element -- Small original illustrations from the supplied menu kit. */
import { Icon } from './SmartMenu'

// Names remain the restaurant's own text. An unmatched ingredient gets a neutral
// utensil icon, never an illustration of a different food or an inferred allergen.
const illustrations: [RegExp, string][] = [
  [/^(huevo|huevos|egg|eggs)$/i, 'emoji-egg-01063649.png'],
  [/^(aguacate|avocado)$/i, 'emoji-avocado-51f303eb.png'],
  [/^(espinaca|espinacas|spinach|lechuga|lettuce)$/i, 'emoji-salad-3c3eac8a.png'],
  [/^(pan|bread|tostada|toast)$/i, 'emoji-french-bread-1049b0de.png'],
  [/^(tomate|tomato)$/i, 'emoji-tomato-7bb84cd7.png'],
  [/^(leche|milk)$/i, 'emoji-milk-6f6158aa.png'],
  [/^(pollo|chicken)$/i, 'emoji-chicken-0761b2ab.png'],
  [/^(res|carne de res|beef)$/i, 'emoji-beef-07f11dae.png'],
  [/^(cerdo|pork)$/i, 'emoji-pork-92bfff84.png'],
  [/^(pescado|fish)$/i, 'emoji-fish-2f434630.png'],
  [/^(zanahoria|carrot)$/i, 'emoji-carrot-2046dbdd.png'],
  [/^(maíz|maiz|corn)$/i, 'emoji-corn-a49471ee.png'],
  [/^(brócoli|brocoli|broccoli)$/i, 'emoji-broccoli-ac46b7ca.png'],
  [/^(champiñones|champiñón|hongos|mushroom|mushrooms)$/i, 'emoji-mushroom-24999c52.png'],
]

export function IngredientIllustration({name}: {name:string}) {
  const asset = illustrations.find(([pattern]) => pattern.test(name.trim()))?.[1]
  return asset ? <img src={`/smart-menu/emoji/${asset}`} alt="" width={24} height={24}/> : <Icon name="plate"/>
}
