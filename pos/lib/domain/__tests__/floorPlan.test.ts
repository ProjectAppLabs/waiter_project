import { extent, invalidTable, normalizePlan, planFits, snap, zoneAt, type FloorDocument } from '@/lib/domain/floorPlan'
import { planImageSrc, contentBounds, fitZoom, salonZoom, tableProblems, type PlanTable } from '@/lib/domain/floorPlan'
const plan: FloorDocument = {id:null,name:'Salón',revision:0,walls:[],zones:[{id:'z',name:'Terraza',color:'#3b82f6',x:0,y:0,width:600,height:400}],tables:[{id:1,key:'1',number:1,seats:6,zone:'z',x:40,y:40,width:120,height:240},{id:2,key:'2',number:2,seats:4,zone:'z',x:200,y:40,width:120,height:120}]}
// Falla si una rotación oculta la colisión antes de apartar la mesa.
it('allows a temporary rotation and identifies the collision until moved away',()=>{
 const rotated={...plan.tables[0],width:240,height:120}
 expect(invalidTable(rotated,plan)).toBe(true)
 expect(invalidTable({...rotated,y:240},plan)).toBe(false)
})
// Falla si se permite guardar paredes superpuestas, números repetidos o capacidad inválida.
it('rejects walls, duplicate numbers and invalid capacity',()=>{
 expect(invalidTable(plan.tables[0],plan)).toBe(false)
 expect(invalidTable({...plan.tables[0],number:2},plan)).toBe(true)
 expect(invalidTable({...plan.tables[0],seats:0},plan)).toBe(true)
 expect(invalidTable(plan.tables[0],{...plan,walls:[{id:'wall',x:0,y:0,width:800,height:40}]})).toBe(true)
})
// Falla si asignar zona no usa el centro de la mesa o asigna mesas exteriores.
it('assigns a table by its center and leaves outside tables unassigned',()=>{
 expect(zoneAt(plan.tables[0],plan.zones)).toBe('z')
 expect(zoneAt({...plan.tables[0],x:800},plan.zones)).toBe('')
})

// Falla si trasladar el plano rompe las posiciones relativas entre capas.
it('allows negative coordinates and translates all layers together for persistence',()=>{
 const draft={...plan,backgroundSize:{x:0,y:0,width:1200,height:800},walls:[{id:'w',x:-400,y:-200,width:20,height:100}],tables:[{...plan.tables[0],x:-200,y:-100}]}
 expect(snap(-83)).toBe(-80)
 expect(invalidTable(draft.tables[0],draft)).toBe(false)
 expect(planFits(draft)).toBe(true)
 const saved=normalizePlan(draft)
 expect(saved.tables[0]).toMatchObject({x:200,y:100,zone:'z'})
 expect(saved.walls[0]).toMatchObject({x:0,y:0})
 expect(saved.zones[0]).toMatchObject({x:400,y:200})
 expect(saved.backgroundSize).toMatchObject({x:400,y:200})
 expect(normalizePlan(saved)).toBe(saved)
 expect(draft.tables[0].x).toBe(-200)
 expect(extent(draft)).toMatchObject({x:-400,y:-200})
 expect(planFits({...draft,tables:[{...draft.tables[0],x:-22000}]})).toBe(false)
})

// Falla si el salón vuelve a dibujar el plano sobre un lienzo mínimo fijo (lo que lo dejaba pegado a una esquina y
// cortado) en vez de encuadrar lo que de verdad hay, o si deja de contar las coordenadas negativas.
it('bounds only what is drawn, with room for the chairs', () => {
 expect(contentBounds([])).toEqual({x:0,y:0,width:0,height:0})
 expect(contentBounds([{x:40,y:0,width:110,height:110},{x:860,y:340,width:110,height:110}])).toEqual({x:-8,y:-48,width:1026,height:546})
 expect(contentBounds([{x:-60,y:20,width:100,height:100}],0)).toEqual({x:-60,y:20,width:100,height:100})
})

// Falla si el plano no cabe entero al abrir, si se amplía sin límite en una pantalla grande, o si una vista sin medir
// (primer render) produce un zoom inválido.
it('fits the whole plan into the view without upscaling past the cap', () => {
 expect(fitZoom({width:1296,height:896},{width:1440,height:634})).toBeCloseTo(0.7076,3)
 expect(fitZoom({width:400,height:300},{width:1440,height:800})).toBe(1.25)
 expect(fitZoom({width:1000,height:800},{width:0,height:0})).toBe(1)
 expect(fitZoom({width:40000,height:40000},{width:1000,height:800})).toBe(0.2)
})

// Falla si una imagen de referencia enorme vuelve a encoger las mesas hasta que no se leen, o si una imagen de tamaño
// normal deja de verse entera.
it('keeps tables readable when a huge reference image would shrink them', () => {
 const view={width:1024,height:446}
 expect(salonZoom({width:1296,height:896},{width:1026,height:546},{width:1440,height:634})).toBeCloseTo(0.7076,3)
 expect(salonZoom({width:1896,height:1296},{width:896,height:776},view)).toBe(0.45)
 expect(salonZoom({width:1896,height:1296},{width:1200,height:1200},view)).toBeCloseTo(0.3717,3)
 // Un panel angosto de pantalla partida: el plano cabe entero al 55 % y se muestra entero, sin recortar.
 expect(salonZoom({width:1296,height:896},{width:1026,height:546},{width:720,height:560})).toBeCloseTo(0.5556,3)
})

// Falla si el editor marca una mesa en rojo sin poder decir por qué, o si la explicación y la validación que bloquea
// el guardado dejan de coincidir.
it('explains every reason a table cannot be saved, in step with invalidTable', () => {
 const table=(o:Partial<PlanTable>):PlanTable=>({id:null,key:'a',number:1,seats:4,zone:'',x:0,y:0,width:120,height:120,...o})
 const plan=(tables:PlanTable[],walls:FloorDocument['walls']=[]):FloorDocument=>({id:null,name:'P',revision:0,tables,walls,zones:[]})
 const ok=table({})
 expect(tableProblems(ok,plan([ok]))).toEqual([])
 const twin=table({key:'b',x:60})
 expect(tableProblems(ok,plan([ok,twin]))).toEqual(['duplicate','table'])
 expect(tableProblems(ok,plan([ok],[{id:'w',x:100,y:0,width:20,height:200}]))).toEqual(['wall'])
 const broken=table({number:0,seats:200,width:10})
 expect(tableProblems(broken,plan([broken]))).toEqual(['number','seats','size'])
 for (const [t,p] of [[ok,plan([ok])],[ok,plan([ok,twin])],[broken,plan([broken])]] as const) expect(tableProblems(t,p).length>0).toBe(invalidTable(t,p))
})

// Falla si una imagen adicional queda fuera del encuadre o del traslado del origen al guardar (se descuadraría respecto
// a las mesas), o si una imagen recién subida y una ya guardada dejan de resolver su origen correcto.
it('treats extra images as part of the plan and resolves their source', () => {
 const doc:FloorDocument={id:1,name:'P',revision:0,tables:[{id:1,key:'1',number:1,seats:4,zone:'',x:0,y:0,width:120,height:120}],walls:[],zones:[],images:[{id:'a',src:'/experience/api/pos/v1/floors/1/images/a?org=burger-house',x:-200,y:40,width:400,height:300}]}
 expect(extent(doc).x).toBe(-200)
 const moved=normalizePlan(doc)
 expect(moved.images![0]).toMatchObject({x:0,y:40}); expect(moved.tables[0].x).toBe(200)
 expect(planFits({...doc,images:[{id:'a',x:0,y:0,width:30000,height:100}]})).toBe(false)
 expect(planImageSrc(doc.images![0])).toBe('/experience/api/pos/v1/floors/1/images/a?org=burger-house')
 expect(planImageSrc({id:'n',data:'/9j/abc',x:0,y:0,width:1,height:1})).toBe('data:image/jpeg;base64,/9j/abc')
 expect(planImageSrc({id:'n',data:'iVBOR',x:0,y:0,width:1,height:1})).toBe('data:image/png;base64,iVBOR')
})
