/* Screenshots of the real components with deterministic, intercepted API responses.
   No fixture account, order or payment is written to any service. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../../..');
const source = process.env.EXPORTY_SOURCE || '/tmp/smart-export';
const output = process.env.EXPORTY_OUTPUT || '/tmp/exporty-audit/current';
const base = process.env.DINER_URL || 'http://192.168.56.10:3001';
const spec = require(path.join(root, 'experience/experience_app/plantillas/catalogo/S1.json'));
const template = { ...spec, layouts: {menu:'S1',carrito:'smart',pago:'smart',registro:'banner5',codigo:'casillas',historial:'tarjetas'}, descuento:{activo:true,porcentaje:5} };
const photos = ['food-picture-a051cfd4.png','avocado-sandwich-1d234106.png','avocado-sandwich-38f1d095.png','avocado-sandwich-a21bc7fe.png','food-picture-d86e4360.png','avocado-sandwich-73cbe1c7.png'];
const dishes = ['Avocado and Egg Toast','Power Bowl','Curry Salmon','Vegetable Salad','Chicken Salad','Yogurt and Fruits'].map((nombre,i)=>({id:i+1,nombre,precio:[10400,14100,14900,11800,12500,9500][i],categorias:[i<3?1:2],foto:`${base}/audit-assets/${photos[i]}`,agotado:false,valoracion:{promedio:i===0?5:4.9,cantidad:120},favorito:i===0||i===4,descripcion:i===0?'You won’t skip the most important meal of the day with this avocado toast recipe. Crispy eggs and creamy avocado top hot buttered toast.':undefined}));
const account = {id:'visual-account',nombre:'Robert Fox',correo:'robert.fox@example.invalid',celular:'5555551234',verificada:true,tieneClave:true};
const entry = {contexto:{restaurante:{slug:'audit',nombre:'Gram Bistro'},sede:{slug:'demo',nombre:'Gram Bistro'},mesa:null,plantilla:template,marca:{nombre:'Gram Bistro',logo:null,lema:'',saludo:'',mesero:'Mesero',bienvenida:'',color:'#6755A0',colorTexto:'#FFFFFF',colorSuave:'#EEEBF5',fuente:'Mulish',radio:16}},carta:{restaurante:'Gram Bistro',categorias:[{id:1,nombre:'Most Popular',productos:dishes.slice(0,3)},{id:2,nombre:'Salad',productos:dishes.slice(3)}]}};
const lines=dishes.slice(0,3).map((d,i)=>({id:i+1,comensal:'visual-diner',mio:true,producto_id:d.id,nombre:d.nombre,precio:d.precio,cantidad:i===0?2:1,nota:'',subtotal:d.precio*(i===0?2:1)}));
const total=lines.reduce((n,l)=>n+l.subtotal,0);
const history=[{id:'42',restaurante:'audit',sede:'demo',fecha:'2026-09-12T12:00:00Z',local:'Gram Bistro',mesa:null,items:4,total,estado:'servido',descuento:0,lineas:lines}];
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const {QRCodeWriter,BarcodeFormat}=require('@zxing/library');const qr=new QRCodeWriter().encode('demo-table',BarcodeFormat.QR_CODE,300,300,new Map());let svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="white"/>';
 for(let y=0;y<300;y++)for(let x=0;x<300;x++)if(qr.get(x,y))svg+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;
 const qrFile=path.join(output,'qr-test.svg');await fs.writeFile(qrFile,svg+'</svg>');
 // CDP_URL: usa un navegador ya abierto (p. ej. Edge de Windows desde WSL, donde Chrome de Linux no tiene sus bibliotecas).
 const browser=process.env.CDP_URL?await chromium.connectOverCDP(process.env.CDP_URL):await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']}); const only=process.env.AUDIT_CASES?.split(','); const evidence=only?JSON.parse(await fs.readFile(path.join(output,'evidence.json'),'utf8')):[];
 // AUDIT_CONTINUE=1: un escenario que falla (p. ej. un paso que ya no existe en la interfaz) se anota y se sigue con el
 // siguiente, en vez de cortar la corrida. Sirve para comparar capturas antes/después con los mismos escenarios.
 const failures=[];
 async function scenario(...args){if(!process.env.AUDIT_CONTINUE)return run(...args);try{await run(...args)}catch(e){failures.push(args[0]);console.log('FALLA',args[0],String(e.message).split('\n')[0])}}
 async function run(name,route,options={},action){
  if(only&&!only.includes(name))return;
  const entryData=structuredClone(entry);if(options.detailed)entryData.carta.categorias[0].productos[0].atributos={ingredientes:['Huevo','Aguacate','Pan','Tomate'],nutricion:{calorias:400,peso:510,proteina:30,grasa:24,carbohidratos:56},extras:[2,4],acompanamientos:[3,5,6]};
  if(options.menuDish)entryData.carta.categorias[0].productos[0].atributos={ingredientes:['Huevo','Aguacate','Espinaca'],nutricion:{calorias:400,peso:510,proteina:30,carbohidratos:56,grasa:24},acompanamientos:[3,5,6]};
  const previous=evidence.findIndex(e=>e.name===name);if(previous>=0)evidence.splice(previous,1);
  const context=await browser.newContext({viewport:options.viewport||{width:375,height:812},deviceScaleFactor:1});const page=await context.newPage();if(process.env.AUDIT_TIMEOUT)page.setDefaultTimeout(Number(process.env.AUDIT_TIMEOUT));const errors=[];const unhandled=[];let state={filled:!!options.cart,authenticated:!!options.account,coupon:false};if(options.clock)await page.clock.install();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/audit-assets/*',async r=>{const f=path.basename(new URL(r.request().url()).pathname);await r.fulfill({contentType:'image/png',body:await fs.readFile(path.join(source,'assets/images',f))})});
  await page.route('**/api/v1/**',async r=>{const u=new URL(r.request().url()).pathname;const method=r.request().method();let data;
   const cart={sesion:'visual-session',lineas:state.filled?lines:[],total:state.filled?total:0,mio:state.filled?total:0,por_comensal:[]};
   const coupon={codigo:'FOOD20',porcentaje:20,monto:total*.2,aplicable:true,aplicado:false};
   if(state.coupon)cart.descuento=coupon;
   if(u.endsWith('/ubicacion/'))data={direccion:'Calle 10, Medellín',latitud:6.208,longitud:-75.567};
   else if(u.endsWith('/recompensas/'))data={tarjeta:7,codigo:'LOYALTY-123',puntos:2300,ganados:2300,programa:'Puntos Gram Bistro',valorPunto:10,minimoCanje:100};
   else if(u.endsWith('/cupon/')){state.coupon=method!=='DELETE';data={...cart,descuento:state.coupon?coupon:undefined}}
   else if(u==='/api/v1/audit/demo/') data=entryData;
   else if(u==='/api/v1/sesiones/') data={sesion:{id:'visual-session',estado:'abierta',mesa:null},comensal:{id:'visual-diner'}};
   else if(u.endsWith('/carrito/')) data=cart;
   else if(u.endsWith('/confirmar/')) {state.filled=false;data={pedido:'42',estado:'enviado',total,cuenta:{ok:true,total,mio:total,porComensal:[],partes:1,porParte:total}}}
   else if(u==='/api/v1/cuenta/') data={cuenta:state.authenticated?account:null,pedidos:state.authenticated?history:[]};
   else if(u==='/api/v1/cuenta/registro/') data={id:'visual-account',codigoDemo:true};
   else if(u==='/api/v1/cuenta/verificar/') {state.authenticated=true;data={ok:true,cuenta:account}}
   else if(u.endsWith('/favoritos/')) data={favoritos:[1,4]};
   else if(u.endsWith('/opinion/')) data={feedback:method==='PUT'?r.request().postDataJSON():null,items:lines.map(l=>({product_id:l.producto_id,name:l.nombre,qty:l.cantidad}))};
   else if(u==='/api/v1/cuenta/clave/') data={cuenta:account};
   else if(u==='/api/v1/cuenta/restablecer/') data={ok:true};
   else if(u==='/api/v1/cuenta/entrar/') data={cuenta:account,pedidos:history};
   else if(u.includes('/pedidos/')) data={id:'42',sesion:'visual-session',estado:options.order||'en_cocina',total,impuestos:0,intentos:1,lineas:lines,...(options.earned?{recompensas:{tarjeta:7,codigo:'LOYALTY-123',puntos:2300,ganados:2300,programa:'Puntos Gram Bistro',valorPunto:10,minimoCanje:100}}:{})};
   else if(u.endsWith('/cuenta/')) data={ok:true,total:(state.filled||route==='la-cuenta'?total:0)*(state.coupon?.8:1),mio:(state.filled||route==='la-cuenta'?total:0)*(state.coupon?.8:1),porComensal:[],partes:1,porParte:total,...(state.coupon?{descuento:coupon}:{})};
   else if(u.endsWith('/pago/simulado/')) data={estado:'aprobado',referencia:'VISUAL-ONLY',demo:true,monto:total};
   else if(u.endsWith('/platos/')) {state.filled=true;data={...cart,lineas:lines,total,mio:total}}
   else if(u.includes('/lineas/')) {state.filled=method!=='DELETE';data={...cart,lineas:state.filled?lines:[],total:state.filled?total:0,mio:state.filled?total:0}}
   else {unhandled.push(`${method} ${u}`);return r.fulfill({status:501,json:{detail:'Unmapped visual fixture'}})}
   await r.fulfill({json:data});
  });
  await page.goto(`${base}/audit/demo/${route}`,{waitUntil:'domcontentloaded'});await page.locator('.smart-menu').waitFor({timeout:60000});
  if(action)await action(page);
  await page.evaluate(async()=>{await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]);await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{})}))});
  await page.screenshot({path:path.join(output,`${name}.png`),fullPage:!(await page.locator('dialog[open]').count())});
  // AUDIT_BOXES=1: anota la caja (y, alto, relleno) de cada elemento, para ubicar qué regla movió algo entre dos capturas.
  const boxes=process.env.AUDIT_BOXES?await page.evaluate(()=>[...document.querySelectorAll('.smart-menu *')].slice(0,600).map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {tag:e.tagName.toLowerCase(),cls:String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className).slice(0,60),y:Math.round(r.top*10)/10,h:Math.round(r.height*10)/10,pad:c.padding,mar:c.margin,fs:c.fontSize,lh:c.lineHeight}})):undefined;
  evidence.push({name,route,boxes,mode:'real-components/intercepted-api',viewport:options.viewport||{width:375,height:812},errors,unhandled,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fonts:{display:document.fonts.check('500 22px "DM Sans"'),body:document.fonts.check('400 14px Mulish')}}))});
 
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(name,errors.length,unhandled.length);await context.close();
 }
 await scenario('dish-menu','plato/1',{menuDish:true});
 await scenario('dish-detailed','plato/1',{detailed:true});
 await scenario('dish-tablet','plato/1',{detailed:true,viewport:{width:768,height:1024}});
 await scenario('dish-desktop','plato/1',{detailed:true,viewport:{width:1440,height:1000}});
 await scenario('dish-extras-selected','plato/1',{detailed:true},async p=>{await p.getByRole('checkbox',{name:/Power Bowl/}).check();await p.getByRole('checkbox',{name:/Vegetable Salad/}).check();await p.getByRole('button',{name:'Más Power Bowl',exact:true}).click()});
 await scenario('password-success','cuenta/restablecer',{},async p=>{await p.getByLabel('Nueva contraseña',{exact:true}).fill('Visual password 42');await p.getByLabel('Confirmar contraseña',{exact:true}).fill('Visual password 42');await p.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await p.getByText('Contraseña restablecida',{exact:true}).waitFor()});
 await scenario('verification-channel','cuenta/registro',{},async p=>{await p.getByLabel('Tu nombre',{exact:true}).fill('Robert Fox');await p.getByLabel('Correo electrónico',{exact:true}).fill(account.correo);await p.getByLabel('Celular',{exact:false}).fill(account.celular);await p.getByLabel('Contraseña',{exact:true}).fill('Visual account password 42');await p.getByRole('checkbox',{name:/Acepto/}).check();await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Opciones de verificación'}).click()});
 await scenario('email-entry','cuenta/correo');
 await scenario('email-filled','cuenta/correo',{},p=>p.getByLabel('Correo electrónico',{exact:true}).fill(account.correo));
 await scenario('password-recover-filled','cuenta/recuperar',{},p=>p.getByLabel('Correo electrónico',{exact:true}).fill(account.correo));
 await scenario('signup-success','cuenta/lista',{account:true});
 await scenario('welcome-splash','bienvenida');
 for(let step=0;step<5;step++)await scenario(`welcome-${step+1}`,'bienvenida',{},async p=>{await p.getByRole('button',{name:'Comenzar',exact:true}).click();for(let i=0;i<step;i++)await p.getByRole('button',{name:'Continuar',exact:true}).click()});
 await scenario('location-choose','ubicacion');
 await scenario('location-rescan','ubicacion/otra');
 await scenario('location-scan','ubicacion',{},p=>p.getByRole('button',{name:/Código de tu mesa/}).click());
 await scenario('location-code','ubicacion',{},async p=>{await p.getByRole('button',{name:/Código de tu mesa/}).click();await p.getByRole('button',{name:'Introducir código manualmente'}).click()});
 await scenario('location-share','ubicacion',{},p=>p.getByRole('button',{name:/Elegir restaurante/}).click());
 await scenario('location-list','ubicacion',{},async p=>{await p.getByRole('button',{name:/Elegir restaurante/}).click();await p.getByRole('button',{name:'Introducir una ubicación'}).click()});
 await scenario('location-empty','ubicacion',{},async p=>{await p.getByRole('button',{name:/Elegir restaurante/}).click();await p.getByRole('button',{name:'Introducir una ubicación'}).click();await p.getByRole('searchbox').fill('No existe')});
 await scenario('location-detail','ubicacion',{},async p=>{await p.getByRole('button',{name:/Elegir restaurante/}).click();await p.getByRole('button',{name:'Introducir una ubicación'}).click();await p.locator('.sm-venue-card').click()});
 await scenario('points-earned','estado/42',{account:true,order:'pagado',earned:true},p=>p.locator('.sm-earned-dialog[open]').waitFor());
 await scenario('checkout-coupon','pago',{cart:true,account:true},async p=>{await p.getByRole('button',{name:'Añadir tarjeta de prueba',exact:true}).click();await p.getByLabel('Nombre del titular').fill('Robert Fox');await p.getByRole('button',{name:'Guardar tarjeta de prueba'}).click();await p.getByLabel('Código de descuento').fill('FOOD20');await p.getByRole('button',{name:'Aplicar',exact:true}).click();await p.getByLabel('Cupón seleccionado').waitFor()});
 await scenario('rewards','recompensas',{account:true});
 await scenario('reward-detail','recompensas',{account:true},p=>p.getByRole('button',{name:'Ver beneficio',exact:true}).click());
 await scenario('login','cuenta/entrar');
 await scenario('password-change','cuenta/clave',{account:true},p=>p.getByText('Contraseña actual',{exact:true}).waitFor());
 await scenario('password-recover','cuenta/recuperar');
 await scenario('password-reset','cuenta/restablecer');
 await scenario('feedback-invite','opinion/42',{},p=>p.getByRole('button',{name:'Valorar mi experiencia'}).waitFor());
 for(let rating=1;rating<=5;rating++)await scenario(`feedback-${rating}`,'opinion/42',{},async p=>{await p.getByRole('button',{name:'Valorar mi experiencia'}).click();await p.getByRole('button',{name:new RegExp(`^${rating}:`)}).click()});
 await scenario('feedback-comment','opinion/42',{},async p=>{await p.getByRole('button',{name:'Valorar mi experiencia'}).click();await p.getByRole('button',{name:'1: Muy mala'}).click();await p.getByRole('button',{name:'Continuar',exact:true}).click()});
 await scenario('feedback-dishes','opinion/42',{},async p=>{await p.getByRole('button',{name:'Valorar mi experiencia'}).click();await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('group',{name:'Valorar Avocado and Egg Toast'}).getByRole('button',{name:'4: Buena'}).click();await p.getByRole('group',{name:'Valorar Power Bowl'}).getByRole('button',{name:'5: Excelente'}).click()});
 await scenario('checkout-empty','pago',{cart:true,account:true});
 await scenario('checkout-add','pago',{cart:true,account:true},p=>p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click());
 await scenario('checkout-card','pago',{cart:true,account:true},async p=>{await p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click();await p.getByLabel('Nombre del titular').fill('Robert Fox');await p.getByRole('button',{name:'Guardar tarjeta de prueba'}).click();await p.locator('.sm-wallet-dialog').waitFor({state:'hidden'})});
 await scenario('checkout-multiple','pago',{cart:true,account:true},async p=>{for(let i=0;i<3;i++){await p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click();await p.getByLabel('Nombre del titular').fill('Robert Fox');await p.getByRole('button',{name:'Guardar tarjeta de prueba'}).click();await p.locator('.sm-wallet-dialog').waitFor({state:'hidden'})}await p.getByRole('button',{name:'Tarjeta 2 de 3'}).click()});
 await scenario('wallet-empty','cuenta/tarjetas',{account:true});
 await scenario('wallet-add','cuenta/tarjetas',{account:true},p=>p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click());
 await scenario('wallet-card','cuenta/tarjetas',{account:true},async p=>{await p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click();await p.getByLabel('Nombre del titular').fill('Robert Fox');await p.getByRole('button',{name:'Guardar tarjeta de prueba'}).click();await p.locator('.sm-wallet-dialog').waitFor({state:'hidden'})});
 await scenario('wallet-multiple','cuenta/tarjetas',{account:true},async p=>{for(let i=0;i<3;i++){await p.getByRole('button',{name:'Añadir tarjeta de prueba'}).click();await p.getByLabel('Nombre del titular').fill('Robert Fox');await p.getByRole('button',{name:'Guardar tarjeta de prueba'}).click();await p.locator('.sm-wallet-dialog').waitFor({state:'hidden'})}await p.getByRole('button',{name:'Tarjeta 2 de 3'}).click()});
 await scenario('assistant-return','asistente',{},async p=>{await p.evaluate(()=>localStorage.setItem('smart-menu:preferences:audit:demo',JSON.stringify({answers:[['😋 Tengo hambre'],[],[],[],[],[],[],[]],updated:'2026-09-12T12:00:00Z'})));await p.getByRole('button',{name:'Usar mis preferencias'}).click()});
 await scenario('preferences-configured','preferencias/actual',{},async p=>{await p.evaluate(()=>localStorage.setItem('smart-menu:preferences:audit:demo',JSON.stringify({answers:[['😋 Tengo hambre'],['🍳 Desayuno'],['🍹 Sin alcohol'],['3'],['🥬 Vegana'],['✓ Ninguna'],['🌱 Prefiero lo conocido'],['🌱 Vegetal']],updated:'2026-09-12T12:00:00Z'})));await p.reload();await p.getByText('Tengo hambre',{exact:true}).waitFor();if(await p.locator('.sm-preferences-detail img').evaluateAll(images=>images.some(image=>image.getBoundingClientRect().width>24)))throw new Error('Preference illustration is oversized')});
 await scenario('preferences-list','preferencias',{},async p=>{await p.evaluate(()=>localStorage.setItem('smart-menu:preferences:audit:demo',JSON.stringify({answers:[['😋 Tengo hambre'],[],[],[],[],[],[],[]],updated:'2026-09-12T12:00:00Z'})));await p.reload();await p.getByText('Tu selección guardada',{exact:true}).waitFor()});
 await scenario('recommendations-list','asistente',{},async p=>{await p.getByRole('button',{name:'Empezar',exact:true}).click();for(let i=0;i<7;i++)await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Ver mi selección'}).click();await p.getByRole('button',{name:'Ver como lista'}).click()});
 await scenario('assistant-reminder','carta',{clock:true},async p=>{await p.clock.fastForward(301000);await p.locator('.sm-reminder[open]').waitFor()});
 await scenario('home','');
 await scenario('assistant','asistente');
 for(let step=0;step<8;step++)await scenario(`assistant-step-${step+1}`,'asistente',{},async p=>{await p.getByRole('button',{name:'Empezar',exact:true}).click();for(let i=0;i<step;i++)await p.getByRole('button',{name:'Continuar',exact:true}).click()});
 await scenario('recommendations','asistente',{},async p=>{await p.getByRole('button',{name:'Empezar',exact:true}).click();for(let i=0;i<7;i++)await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Ver mi selección'}).click()});
 await scenario('preferences-empty','preferencias');
 await scenario('about','acerca');
 await scenario('help','ayuda');
 await scenario('help-category','ayuda',{},p=>p.getByRole('button',{name:'Mi cuenta',exact:true}).click());
 await scenario('help-article','ayuda',{},async p=>{await p.getByRole('button',{name:'Mi cuenta',exact:true}).click();await p.getByRole('button',{name:'¿Para qué sirve mi cuenta?',exact:true}).click()});
 await scenario('menu','carta');
 await scenario('category','carta',{},p=>p.getByRole('button',{name:'Most Popular',exact:true}).click());
 await scenario('search','carta',{},p=>p.getByRole('searchbox').fill('Chicken'));
 await scenario('menu-cart','carta',{cart:true});
 await scenario('dish','plato/1');
 await scenario('dish-added','plato/1',{},async p=>{await p.getByRole('button',{name:/Agregar a mi pedido/}).click();await p.getByText('Agregado a tu pedido',{exact:true}).waitFor()});
 await scenario('cart','pedido',{cart:true});
 await scenario('cart-empty','pedido');
 for(const [name,order] of [['received','enviado'],['preparing','en_cocina'],['ready','listo'],['served','servido'],['paid-order','pagado'],['failed-order','fallido']])await scenario(name,'estado/42',{order},p=>p.locator(order==='pagado'?'.sm-paid-celebration':'.sm-status').waitFor());
 await scenario('payment','pago',{cart:true},p=>p.getByRole('button',{name:'Simular pago'}).waitFor());
 await scenario('payment-success','pago',{cart:true},async p=>{await p.getByRole('button',{name:'Simular pago'}).click();await p.getByText('Simulación completada',{exact:true}).waitFor()});
 await scenario('navigation','carta',{account:true},async p=>{await p.getByRole('button',{name:'Abrir navegación'}).click();await p.getByText('Robert Fox',{exact:true}).waitFor()});
 await scenario('home-active','estado/42',{account:true,order:'en_cocina'},async p=>{await p.locator('.sm-status').waitFor();await p.getByRole('button',{name:'Volver al menú'}).click();await p.getByRole('link',{name:'Gram Bistro',exact:true}).click();await p.getByText('Pedido activo',{exact:true}).waitFor()});
 await scenario('history','historial',{account:true},p=>p.locator('.sm-history-card').waitFor());
 await scenario('profile','cuenta',{account:true},p=>p.getByRole('heading',{name:'Robert Fox',exact:true}).waitFor());
 await scenario('profile-edit','cuenta/informacion',{account:true},p=>p.getByLabel('Tu nombre',{exact:true}).waitFor());
 await scenario('receipt','recibo/42',{account:true},p=>p.locator('.sm-paper-receipt').waitFor());
 await scenario('guest-profile','cuenta');
 await scenario('favorites','favoritos',{account:true},p=>p.locator('.sm-food-card').first().waitFor());
 await scenario('signup','cuenta/registro');
 await scenario('signup-invalid','cuenta/registro',{},async p=>{await p.getByLabel('Tu nombre',{exact:true}).fill('Robert Fox');await p.getByLabel('Correo electrónico',{exact:true}).fill('robert.fox.example.invalid');await p.getByRole('button',{name:'Continuar',exact:true}).click()});
 await scenario('signup-filled','cuenta/registro',{},async p=>{await p.getByLabel('Tu nombre',{exact:true}).fill('Robert Fox');await p.getByLabel('Correo electrónico',{exact:true}).fill(account.correo);await p.getByLabel('Celular',{exact:false}).fill(account.celular);await p.getByLabel('Contraseña',{exact:true}).fill('Visual account password 42');await p.getByRole('checkbox',{name:/Acepto/}).check()});
 for(const filled of [false,true])await scenario(filled?'code-filled':'code','cuenta/registro',{},async p=>{await p.getByLabel('Tu nombre',{exact:true}).fill('Robert Fox');await p.getByLabel('Correo electrónico',{exact:true}).fill(account.correo);await p.getByLabel('Contraseña',{exact:true}).fill('Visual account password 42');await p.getByRole('checkbox',{name:/Acepto/}).check();await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('heading',{name:'Verifica tu cuenta',exact:true}).waitFor();if(filled)await p.getByLabel('Código de verificación',{exact:true}).fill('123456')});
 await scenario('qr-decoded','ubicacion',{},async p=>{await p.getByRole('button',{name:/Código de tu mesa/}).click();await p.getByLabel('Foto del código QR').setInputFiles(qrFile);await p.getByLabel('Código o enlace de la mesa').waitFor();if(await p.getByLabel('Código o enlace de la mesa').inputValue()!=='demo-table')throw new Error('QR decode mismatch')});
 await scenario('cart-mode','pedido',{cart:true},p=>p.getByRole('button',{name:'Confirmar pedido',exact:true}).click());
 await scenario('cart-swiped','pedido',{cart:true},async p=>{const row=p.locator('.sm-cart-line').first();await row.dispatchEvent('pointerdown',{clientX:250,clientY:180});await row.dispatchEvent('pointerup',{clientX:100,clientY:180})});
 await scenario('status-expanded','estado/42',{order:'en_cocina'},p=>p.locator('.sm-status-details summary').click());
 await scenario('recommendation-detail','asistente',{detailed:true},async p=>{await p.getByRole('button',{name:'Empezar',exact:true}).click();for(let i=0;i<7;i++)await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Ver mi selección'}).click();await p.locator('.sm-recommendations .sm-food-link').first().click()});
 await scenario('bill','la-cuenta',{cart:true},p=>p.locator('.sm-total').first().waitFor());
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));if(failures.length)console.log('ESCENARIOS FALLIDOS',failures.length,failures.join(','));await browser.close();if(evidence.some(e=>e.errors.length||e.unhandled.length||e.overflow))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
