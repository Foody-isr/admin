/** Synthetic UI fixtures. Never connects to, proxies or writes to a real API. */
export function createFixture({ empty = false, denied = false, fail = false, permissions, library = false, rotation = false, menuLibrary = false, carte = false, unitLibrary = false, stockLibrary = false } = {}) {
  const restaurant = { id: 1, name: 'Atelier Foody', slug: 'atelier-demo', currency: 'ILS', timezone: 'Asia/Jerusalem', week_start_day: 0, dashboard_revenue_mode: 'paid_only', opening_hours_config: {}, dine_in_enabled: true, delivery_enabled: true, pickup_enabled: true, service_mode: 'table', address: 'Établissement de démonstration', phone: '', business_type: 'restaurant', is_active: true };
  const items = empty ? [] : [
    { id: 1, restaurant_id: 1, name: 'Salade méditerranéenne', description: 'Légumes de saison, herbes fraîches et tahini', price: 48, base_price: 48, cost_price: 13.44, category_id: 1, is_active: true, is_available: true, rotation_group: '', item_type: 'food_and_beverage', variants: [], modifiers: [], modifier_sets: [], ingredients: [], image_url: '', sort_order: 1, tax_rate: 18 },
    { id: 2, restaurant_id: 1, name: 'Focaccia maison — tomates confites et basilic', price: 42, base_price: 42, cost_price: 11.2, category_id: 1, is_active: true, is_available: true, rotation_group: '', item_type: 'food_and_beverage', variants: [], modifiers: [], modifier_sets: [], ingredients: [], image_url: '', sort_order: 2 },
    { id: 3, restaurant_id: 1, name: 'קפה הפוך · Cappuccino', price: 16, base_price: 16, cost_price: 4, category_id: 2, is_active: true, is_available: true, rotation_group: '', item_type: 'food_and_beverage', variants: [], modifiers: [], modifier_sets: [], ingredients: [], image_url: '', sort_order: 3 },
  ];
  const optionSets = empty ? [] : [{id:1,name:'Taille de portion',sort_order:1,options:[{id:1,option_set_id:1,name:'Individuelle',price:48,is_active:true,sort_order:1},{id:2,option_set_id:1,name:'À partager',price:82,is_active:true,sort_order:2}],menu_items:[]}];
  const itemOptionOverrides = {};
  const modifierSets = empty ? [] : [{id:1,name:'Accompagnements',display_name:'Votre accompagnement',is_required:false,allow_multiple:true,min_selections:0,max_selections:2,modifiers:[{id:1,name:'Tahini supplémentaire',price_delta:4,is_active:true,sort_order:1,action:'add',quantity:0,unit:'g'}],menu_items:[]}];
  /** @type {import('../../src/lib/api').StockItem[]} */
  const stock = (empty ? [] : [{id:1,restaurant_id:1,name:'Tomates de saison',unit:'kg',quantity:12,cost_per_unit:16,vat_rate_override:0,is_active:true,category:'Légumes',unit_conversions:/** @type {import('../../src/lib/api').StockItemUnitConversion[]} */([])},{id:2,restaurant_id:1,name:'Tahini',unit:'kg',quantity:4,cost_per_unit:36,vat_rate_override:null,is_active:true,category:'Épicerie',unit_conversions:/** @type {import('../../src/lib/api').StockItemUnitConversion[]} */([])}]).map(item=>({reorder_threshold:0,supplier:'',supplier_id:null,notes:'',pack_size:0,container_type:'',unit_type:'',price_includes_vat:false,image_url:'',sku:'',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',...item}));
  if(stockLibrary && stock.length){stock[0].reorder_threshold=30;stock.push({...stock[1],id:3,name:'Lait de démonstration — carton de six bouteilles · חלב',quantity:12,unit:'l',cost_per_unit:9,container_type:'carton',unit_type:'bottle',pack_size:6,unit_content:1,unit_content_unit:'l',supplier:'Ferme démo',category:'Produits laitiers'});}
  const stockCategories=stockLibrary?[...new Set(stock.map(item=>item.category))].map((name,index)=>({id:index+1,name,color:'',image_url:'',sort_order:index,is_active:true})):[];
  const customUnits = !empty && unitLibrary ? [{id:41,restaurant_id:1,name:'Pièce',abbreviation:'pce',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'},{id:42,restaurant_id:1,name:'Cuillère de service — mesure de démonstration · כף',abbreviation:'cs',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}] : [];
  if (unitLibrary && stock.length) stock[0].unit_conversions = [{id:1,stock_item_id:1,custom_unit_id:41,base_quantity:0.15,custom_unit:customUnits[0]}];
  const recipe = stock.map((ingredient,i)=>({id:i+1,menu_item_id:1,stock_item_id:ingredient.id,stock_item:ingredient,quantity_needed:i===0?0.25:0.07,unit:'kg'}));
  const preps = empty ? [] : [{id:1,name:'Sauce tomate',category:'Bases',unit:'l',quantity:12,yield_per_batch:6,is_active:true},{id:2,name:'Légumes découpés',category:'Mise en place',unit:'kg',quantity:3,yield_per_batch:5,is_active:true},{id:3,name:'Pâte à focaccia',category:'Boulangerie',unit:'portions',quantity:0,yield_per_batch:20,is_active:true}].map(item=>({restaurant_id:1,reorder_threshold:0,shelf_life_hours:24,notes:'',cost_per_unit:0,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',...item}));
  const plans = preps.slice(1).map((p,i)=>({prep_item_id:p.id,prep_item_name:p.name,unit:p.unit,current_qty:p.quantity,required_qty:i===0?8:40,shortfall_qty:i===0?5:40,batches_needed:i===0?1:2,yield_per_batch:p.yield_per_batch,shelf_life_hours:24,category:p.category,priority:i===0?'high':'medium'}));
  const now = new Date(); const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(now);
  const orders = empty ? [] : Array.from({length:8}, (_,i) => ({ id:1048+i, restaurant_id:1, order_number:1048+i, order_type:['dine_in','pickup','delivery'][i%3], status:['in_kitchen','pending_review','ready_for_delivery','accepted'][i%4], payment_status: i%3===0?'unpaid':'paid', payment_method: i%3===0?'cash':'card', total_amount: [80,138,294,48][i%4], total: [80,138,294,48][i%4], subtotal_amount: [80,138,294,48][i%4], tax:0, discount:0, delivery_fee:0, tip:0, customer_name:['Client démo','Équipe Foody — réception de démonstration','לקוח לדוגמה'][i%3], customer_phone:'', customer_email:'', table_number:i%3===0?'08':null, created_at:new Date(now.getTime()-i*6*60000).toISOString(), updated_at:now.toISOString(), is_scheduled:false, notes:'Données fictives pour vérification visuelle', items:[{ id:100+i, menu_item_id:1, name:'Salade méditerranéenne', item_name:'Salade méditerranéenne', quantity:1, unit_price:48, price:48, total_price:48, subtotal:48, modifiers:[], notes:'' },{id:200+i, menu_item_id:3,name:'Cappuccino',item_name:'Cappuccino',quantity:2,unit_price:16,price:16,total_price:32,subtotal:32,modifiers:[]}], payments:[], events:[], status_history:[] }));
  if(rotation && items.length){Object.assign(items[0],{rotation_group:'Cuisine de saison'});Object.assign(items[1],{rotation_group:'Cuisine de saison'});}
  const sunday=new Date(date+'T00:00:00Z');sunday.setUTCDate(sunday.getUTCDate()-sunday.getUTCDay());
  const rotationSchedules=rotation && !empty?[{id:1,restaurant_id:1,rotation_group:'Cuisine de saison',menu_item_id:1,week_start:sunday.toISOString().slice(0,10),created_at:now.toISOString()}]:[];
  if(library && items.length) items[0].modifiers.push({id:21,menu_item_id:1,name:'Sans garniture — ajustement individuel',action:'remove',category:'Garniture',price_delta:-2.5,is_required:false,sort_order:0});
  const imagePrompts=empty?[]:[{id:1,restaurant_id:1,name:'Studio Foody — présentation à partager',prompt:'Photographie de {{item_name}}, lumière naturelle douce. Description : {{item_description}}. Catégorie : {{category}}.',is_default:true,created_at:now.toISOString(),updated_at:now.toISOString()}];
  const categories = empty ? [] : [{id:1,name:'Cuisine',items:items.filter(i=>i.category_id===1),sort_order:1},{id:2,name:'Boissons',items:items.filter(i=>i.category_id===2),sort_order:2}];
  const locations=[{id:1,restaurant_id:1,name:'Salle principale',address:'Adresse démo',is_active:true},{id:2,restaurant_id:1,name:'Terrasse',address:'',is_active:true},{id:3,restaurant_id:1,name:'Annexe inactive',address:'',is_active:false}];
  const menuHours={1:menuLibrary?[{id:1,menu_id:1,day_of_week:0,open_time:'09:00',close_time:'21:00',is_closed:false},{id:2,menu_id:1,day_of_week:5,open_time:'21:00',close_time:'02:00',is_closed:false}]:[],2:[]};
  const groupHours={1:[],2:[]};
  const menuLocations={1:[1,3],2:[]};
  const menus=empty?[]:[{id:1,name:'Carte du jour',is_active:true,pos_enabled:true,web_enabled:true,follows_restaurant_hours:!menuLibrary,is_weekly_rotating:false,categories,groups:[{id:1,name:'À la carte',items}],items},...(menuLibrary?[{id:2,name:'Carte des réceptions — événements de démonstration',is_active:false,pos_enabled:true,web_enabled:false,follows_restaurant_hours:true,is_weekly_rotating:false,categories:[],groups:[],items:[]}]:[])];
  let settings={require_dine_in_prepayment:false,require_pickup_prepayment:true,require_delivery_prepayment:true,auto_send_to_kitchen:true,auto_send_dine_in_to_kitchen:null,auto_send_pickup_to_kitchen:null,auto_send_delivery_to_kitchen:null,pickup_prep_time_minutes:20,scheduling_lead_time_minutes:90,scheduling_min_days_ahead:1,scheduling_max_days_ahead:7,scheduling_slot_duration_minutes:30,scheduling_require_prepayment:false,batch_fulfillment_enabled:false,batch_cutoff_day:3,batch_cutoff_time:'22:00',batch_order_open_day:3,batch_order_open_time:'22:00',batch_fulfillment_days:[],batch_require_prepayment:true,require_order_approval:true,service_mode:'table',tips_enabled:true,scheduling_enabled:false,rush_mode:false,orders_paused:false,accepting_orders:true,delivery_enabled:true,pickup_enabled:true,vat_rate:18};
  let preferences={dashboard_date_basis:'created',orders_date_basis:'created',orders_default_tab:'active'};
  const summary={start:date,end:new Date(new Date(date+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10),total_revenue:empty?0:6840,total_orders:empty?0:84,avg_ticket:empty?0:81.43,items_sold:empty?0:162};
  const permissionsCatalog=[{domain:'orders',permissions:[{key:'orders.view',label:'View orders',description:'Read order information'},{key:'orders.manage',label:'Manage orders',description:'Update order status'}]},{domain:'staff',permissions:[{key:'staff.view',label:'View staff',description:'Read staff information'},{key:'staff.manage',label:'Manage staff',description:'Manage invitations and roles'}]}];
  const roles=empty?[]:[{id:1,restaurant_id:1,name:'Manager',description:'Restaurant management',is_system_default:true,permissions:[{id:1,restaurant_role_id:1,permission:'orders.view'},{id:2,restaurant_role_id:1,permission:'orders.manage'}],user_count:1,created_at:now.toISOString()},{id:2,restaurant_id:1,name:'Équipe événementielle — coordination',description:'Préparation et suivi des réceptions de démonstration.',is_system_default:false,permissions:[{id:3,restaurant_role_id:2,permission:'orders.view'}],user_count:0,created_at:now.toISOString()}];
  if(carte && menus.length) menus[0].groups=[{id:1,name:'À la carte',items:items.slice(0,2)},{id:2,name:'Sélection du chef — démonstration',items:[]}];
  let posLayout={tiles:[{tile_type:'group',ref_group_id:1,size:'petit',bg_type:'color',color:'#1C1C1E',image_url:'',position:0},{tile_type:'item',ref_item_id:3,size:'large',bg_type:'color',color:'#2563EB',image_url:'',position:1}],group_tiles:{}};
  const futureDate=new Date(date+'T00:00:00Z');futureDate.setUTCDate(futureDate.getUTCDate()+7);const future=futureDate.toISOString().slice(0,10);
  const batchConfig={enabled:true,ordering_open:true,current_batch_open_at:date+'T08:00:00Z',current_batch_cutoff:date+'T18:00:00Z',cutoff_day_name:'Friday',cutoff_time:'18:00',open_day_name:'Sunday',open_time:'08:00',fulfillment_days:[{date,day_name:'Friday'}],next_batch_open_at:future+'T08:00:00Z',next_batch_cutoff:future+'T18:00:00Z',next_fulfillment_days:[{date:future,day_name:'Friday'}],upcoming_cycles:[{open_at:date+'T08:00:00Z',cutoff_at:date+'T18:00:00Z',fulfillment_days:[{date,day_name:'Friday'}]},{open_at:future+'T08:00:00Z',cutoff_at:future+'T18:00:00Z',fulfillment_days:[{date:future,day_name:'Friday'}]}],require_prepayment:false};
  const memberships={1:items.slice(0,2).map((item,index)=>({id:index+1,menu_group_id:1,menu_item_id:item.id,sort_order:index,effective_from:'',effective_until:index===1?date:''})),2:[]};
  const staff=empty?[]:[{id:1,full_name:'Équipe démo',email:'owner@foody.test',phone:'',role:'owner',role_name:'Owner',invite_status:'active',pos_pin_configured:true,table_assignment_eligible:false,unrestricted_table_access:true},{id:2,full_name:'Responsable démo — coordination des événements',email:'coordination@foody.test',phone:'',role:'manager',role_id:1,role_name:'Manager',invite_status:'pending',pos_pin_configured:false,table_assignment_eligible:true,unrestricted_table_access:false}];
  /** @type {import('../../src/lib/api').POSAccessCredential[]} */
  const posDevices=empty?[]:[{id:1,restaurant_id:1,name:'Caisse principale — accueil des événements',enrolled_by_user_id:1,enrolled_by_name:'Équipe démo',last_used_at:now.toISOString(),expires_at:new Date(now.getTime()+31*86400000).toISOString(),created_at:now.toISOString(),updated_at:now.toISOString()},{id:2,restaurant_id:1,name:'Caisse démo expirée',enrolled_by_user_id:1,enrolled_by_name:'Équipe démo',expires_at:new Date(now.getTime()-86400000).toISOString(),created_at:now.toISOString(),updated_at:now.toISOString()}];
  const shifts=empty?[]:Array.from({length:3},(_,i)=>({id:i+1,restaurant_id:1,user_id:2,pos_device_id:1,started_at:new Date(now.getTime()-(i+1)*4*3600000).toISOString(),ended_at:i===0?undefined:new Date(now.getTime()-i*4*3600000).toISOString(),start_method:'pin',end_reason:i===0?undefined:'clock_out',staff_name:'Responsable démo — coordination des événements',staff_email:'coordination@foody.test',role_name:'Manager',duration_seconds:14400,order_count:24,table_count:8,sales_total:1680}));
  let tableMode='collaborative';
  let tableAssignment={user_id:2,table_ids:[1],section_ids:[],floor_plan_ids:[],effective_table_ids:[1]};
  const floorTables=empty?[]:[{id:1,code:'DEMO1',name:'Table 01 — salle principale',seats:4,active:true,section_id:1},{id:2,code:'DEMO2',name:'Table 02 — réception',seats:6,active:true,section_id:1}];
  const floorSections=empty?[]:[{id:1,restaurant_id:1,name:'Section accueil',sort_order:1,tables:floorTables,created_at:now.toISOString(),updated_at:now.toISOString()}];
  const floorPlans=empty?[]:[{id:1,restaurant_id:1,name:'Salle principale — événements',sort_order:1,placements:[],decorations:[],created_at:now.toISOString(),updated_at:now.toISOString()}];
  let ingredientId = 100;
  /** @type {Record<number, import('../../src/lib/api').MenuItemIngredient[]>} */
  const recipeByItem = {1:recipe,2:recipe,3:recipe};
  const recipeSteps = {1: empty ? [] : [{id:1,menu_item_id:1,step_number:1,instruction:'Préparer les légumes\nLaver et découper les tomates.',duration_mins:5}]};
  const availabilityRules = empty ? [] : [{id:1,restaurant_id:1,name:'Standard',sort_order:0,is_default:true,track:true,low_stock_threshold:5,out_of_stock_behavior:'sold_out',show_count:true},{id:2,restaurant_id:1,name:'Réserve événement',sort_order:1,is_default:false,track:true,low_stock_threshold:10,out_of_stock_behavior:'hide',show_count:false}];
  const recipeExtraction={recipes:[{dish_name:'Sauce de tomates démo',dish_description:'Recette synthétique',servings:4,total_yield:1,total_yield_unit:'kg',ingredients:[{original_name:'Tomato',translated_name:'Tomates de saison',quantity:250,unit:'g',matched_item_id:1,matched_item_name:'Tomates de saison',confidence:0.95,is_new:false}],steps:[{title:'Cuire les tomates',description:'Mijoter doucement.',duration_mins:15}],confidence:0.9,matched_menu_item_name:''}]};
  const prepRecipes={};const prepSteps={};
  const stockTransactions=stockLibrary?[{id:1,restaurant_id:1,stock_item_id:1,type:'receive',quantity_delta:5,notes:'Livraison de démonstration · קבלה',created_at:now.toISOString()}]:[];
  const writes=[];const unhandled=[];
  function response(url,method='GET',body={},restaurantId=1) {
    const u=new URL(url,'http://127.0.0.1');const p=u.pathname.replace(/\/$/,'');const q=u.searchParams;
    if(fail && !['/api/v1/users/me','/api/v1/restaurants/1'].includes(p)) return {status:503,json:{error:'Fixture unavailable'}};
    if(method==='OPTIONS') return {status:204};
    if(method!=='GET') {
      writes.push(p);
      if(/^\/api\/v1\/menu\/items\/\d+\/ai-image\/generate$/.test(p)&&method==='POST') return {json:{generation_id:71,image_b64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',rendered_prompt:body.prompt_override}};
      if(/^\/api\/v1\/menu\/items\/\d+\/ai-image\/confirm$/.test(p)&&method==='POST'){const item=items.find(i=>i.id===Number(p.split('/')[5]));item.image_url='/brand/favicon.svg';return {json:{image_url:item.image_url,item}};}
      if(p==='/api/v1/stock/import/recipes/text'&&method==='POST')return {json:{extraction:recipeExtraction}};
      if(p==='/api/v1/stock/import/recipes/confirm'&&method==='POST'){
        for(const recipe of body.recipes)recipeByItem[recipe.menu_item_id]=recipe.ingredients.map(ing=>{let stockId=ing.stock_item_id;if(!stockId){stockId=Math.max(0,...stock.map(i=>i.id))+1;stock.push({...stock[0],...ing,id:stockId,quantity:0,is_active:true});}return {id:++ingredientId,menu_item_id:recipe.menu_item_id,stock_item_id:stockId,quantity_needed:ing.quantity_needed,unit:ing.unit,stock_item:stock.find(i=>i.id===stockId),variant_overrides:[]};});
        return {json:{ok:true}};
      }
      if(p==='/api/v1/stock/import/recipes/confirm-prep'&&method==='POST'){
        let prep=preps.find(p=>p.id===body.prep_item_id);if(!prep){prep={...preps[0],id:Math.max(0,...preps.map(p=>p.id))+1,name:body.name,quantity:0,is_active:true};preps.push(prep);}
        Object.assign(prep,{yield_per_batch:body.yield,unit:body.yield_unit,prep_time_mins:body.prep_time_mins});prepRecipes[prep.id]=body.ingredients;prepSteps[prep.id]=body.steps;return {json:{item:prep}};
      }
      if(/^\/api\/v1\/stock\/items\/\d+$/.test(p)&&method==='PUT'){const item=stock.find(value=>value.id===Number(p.split('/').pop()));if(item)Object.assign(item,body);return {json:{item}};}
      if(/^\/api\/v1\/menu\/option-sets\/\d+\/items\/\d+\/options\/\d+$/.test(p)&&method==='PUT'){const parts=p.split('/');const itemId=Number(parts[7]);const optionId=Number(parts[9]);const row={id:optionId,option_set_id:Number(parts[5]),menu_item_id:itemId,option_id:optionId,...body};itemOptionOverrides[itemId]=[...(itemOptionOverrides[itemId]??[]).filter(value=>value.option_id!==optionId),row];return {json:{item_option:row}};}
      if(p==='/api/v1/units'&&method==='POST'){const unit={id:Math.max(0,...customUnits.map(value=>value.id))+1,restaurant_id:restaurantId,created_at:now.toISOString(),updated_at:now.toISOString(),...body};customUnits.push(unit);return {json:{unit}};}
      if(/^\/api\/v1\/units\/\d+$/.test(p)) {const index=customUnits.findIndex(value=>value.id===Number(p.split('/').pop()));if(method==='DELETE'){if(index>=0)customUnits.splice(index,1);return {json:{}};}if(method==='PUT'&&index>=0){Object.assign(customUnits[index],body);return {json:{unit:customUnits[index]}};}}
      if(/^\/api\/v1\/stock\/items\/\d+$/.test(p)&&method==='DELETE'){const index=stock.findIndex(item=>item.id===Number(p.split('/').pop()));if(index>=0)stock.splice(index,1);return {json:{}};}
      if(p==='/api/v1/stock/import/csv'&&method==='POST'){
        const created=[],skipped=[];
        for(const category of body.categories)for(const name of category.items){if(stock.some(item=>item.category.toLowerCase()===category.name.toLowerCase()&&item.name.toLowerCase()===name.toLowerCase())){skipped.push({name,category:category.name,reason:'already_exists'});continue;}const item={...stock[0],id:Math.max(0,...stock.map(value=>value.id))+1,name,category:category.name,unit:body.default_unit,quantity:0,cost_per_unit:0};stock.push(item);created.push({id:item.id,name,category:item.category});}
        return {json:{created,skipped}};
      }
      if(p==='/api/v1/stock/items/batch-vat'&&method==='PATCH'){for(const item of stock)if(body.item_ids.includes(item.id))item.vat_rate_override=body.vat_rate_override;return {json:{}};}
      if(p==='/api/v1/stock/items/batch-category'&&method==='PATCH'){for(const item of stock)if(body.item_ids.includes(item.id))item.category=body.category;return {json:{}};}
      if(p==='/api/v1/stock/transactions'&&method==='POST'){const item=stock.find(item=>item.id===body.stock_item_id);if(!item)return {status:404,json:{error:'Item missing'}};item.quantity=Math.max(0,item.quantity+body.quantity_delta);const transaction={...body,id:Math.max(0,...stockTransactions.map(value=>value.id))+1,restaurant_id:restaurantId,created_at:now.toISOString()};stockTransactions.unshift(transaction);return {json:{transaction:{...transaction,stock_item:item}}};}
      if(p==='/api/v1/stock/categories'&&method==='POST'){let category=stockCategories.find(value=>value.name===body.name);if(!category){category={id:Math.max(0,...stockCategories.map(value=>value.id))+1,color:'',image_url:'',sort_order:0,is_active:true,...body};stockCategories.push(category);}return {json:{category}};}
      if(/^\/api\/v1\/stock\/categories\/\d+$/.test(p)){const index=stockCategories.findIndex(value=>value.id===Number(p.split('/').pop()));if(index<0)return {status:404,json:{error:'Category missing'}};if(method==='DELETE'){stockCategories.splice(index,1);return {json:{}};}if(method==='PUT'){const old=stockCategories[index].name;Object.assign(stockCategories[index],body);for(const item of stock)if(item.category===old)item.category=body.name;return {json:{category:stockCategories[index]}};}}
      if(p==='/api/v1/stock/items'&&method==='POST'){const item={...stock[0],id:Math.max(0,...stock.map(i=>i.id))+1,quantity:0,...body};stock.push(item);return {json:{item}};}
      if(p==='/api/v1/prep/items'&&method==='POST'){const item={...preps[0],id:Math.max(0,...preps.map(i=>i.id))+1,quantity:0,...body};preps.push(item);return {json:item};}
      if(/^\/api\/v1\/prep\/items\/\d+\/ingredients$/.test(p)&&method==='PUT')return {json:{ingredients:body.ingredients}};

      if (/^\/api\/v1\/stock\/menu-items\/\d+\/ingredients$/.test(p) && method==='PUT') {const id=Number(p.split('/')[5]);recipeByItem[id]=body.ingredients.map(ingredient=>({...ingredient,id:++ingredientId,menu_item_id:id,stock_item:stock.find(s=>s.id===ingredient.stock_item_id),prep_item:preps.find(s=>s.id===ingredient.prep_item_id)}));return {json:{ingredients:recipeByItem[id]}};}

      if (/^\/api\/v1\/recipes\/items\/\d+\/steps$/.test(p) && method==='PUT') {const id=Number(p.split('/')[5]);recipeSteps[id]=body.steps.map((step,i)=>({...step,id:i+1,menu_item_id:id}));return {json:{steps:recipeSteps[id]}};}
      if (/^\/api\/v1\/recipes\/items\/\d+\/meta$/.test(p) && method==='PUT') {const item=items.find(i=>i.id===Number(p.split('/')[5]));if(item)Object.assign(item,body);return {json:{ok:true}};}
      if (/^\/api\/v1\/menu\/option-sets\/\d+\/items\/\d+\/options\/\d+\/stock$/.test(p) && method==='PUT') return {json:{}};

      if(p==='/api/v1/menu/items'&&method==='POST'){const item={...items[0],id:Math.max(0,...items.map(i=>i.id))+1,modifiers:[],modifier_sets:[],variants:[],...body};items.push(item);categories.find(c=>c.id===item.category_id)?.items.push(item);return {json:{item}};}
      if(/^\/api\/v1\/menu\/modifier-sets\/\d+\/items$/.test(p)&&method==='POST'){const set=modifierSets.find(s=>s.id===Number(p.split('/')[5]));for(const id of body.menu_item_ids){const item=items.find(i=>i.id===id);if(item&&set)item.modifier_sets.push({...set});}return {json:{}};}
      if(/^\/api\/v1\/menu\/modifier-sets\/\d+\/items\/\d+$/.test(p)&&method==='DELETE'){const parts=p.split('/');const setId=Number(parts[5]);const item=items.find(i=>i.id===Number(parts[7]));if(item)item.modifier_sets=item.modifier_sets.filter(set=>set.id!==setId);return {json:{}};}
      if(/^\/api\/v1\/menu\/modifier-sets\/\d+\/items\/\d+\/overrides$/.test(p)&&method==='PUT'){const parts=p.split('/');const setId=Number(parts[5]);const item=items.find(i=>i.id===Number(parts[7]));const set=item?.modifier_sets.find(set=>set.id===setId);if(set){for(const [key,value] of Object.entries(body))if(value!==null)set[key]=value;}return {json:{}};}
      if(/^\/api\/v1\/menu\/items\/\d+\/variants-sync$/.test(p)&&method==='PUT')return {json:{}};
      if(p==='/api/v1/menu/menus/1/pos-display'&&method==='PUT'){posLayout=body;return {json:posLayout};}
      if(/^\/api\/v1\/menu\/groups\/\d+$/.test(p)&&method==='PUT'){const group=menus.flatMap(m=>m.groups).find(g=>g.id===Number(p.split('/').pop()));Object.assign(group,body);return {json:{group}};}
      if(p==='/api/v1/menu/groups'&&method==='POST'){const group={id:Math.max(0,...menus.flatMap(m=>m.groups).map(g=>g.id))+1,items:[],...body};menus.find(m=>m.id===body.menu_id).groups.push(group);groupHours[group.id]=[];memberships[group.id]=[];return {json:{group}};}
      if(/^\/api\/v1\/menu\/groups\/\d+\/hours$/.test(p)&&method==='PUT'){const id=Number(p.split('/')[5]);groupHours[id]=body.map((h,i)=>({...h,id:i+1,menu_group_id:id}));return {json:{hours:groupHours[id]}};}
      if(p==='/api/v1/menu/groups/reorder'&&method==='POST'){const menu=menus.find(m=>m.id===body.menu_id);menu?.groups.sort((a,b)=>body.group_ids.indexOf(a.id)-body.group_ids.indexOf(b.id));return {json:{}};}
      if(/^\/api\/v1\/menu\/groups\/\d+$/.test(p)&&method==='DELETE'){const id=Number(p.split('/').pop());for(const menu of menus)menu.groups=menu.groups.filter(g=>g.id!==id);return {json:{}};}
      if(/^\/api\/v1\/menu\/groups\/\d+\/items\/reorder$/.test(p)&&method==='POST'){const group=menus.flatMap(m=>m.groups).find(g=>g.id===Number(p.split('/')[5]));group?.items.sort((a,b)=>body.item_ids.indexOf(a.id)-body.item_ids.indexOf(b.id));return {json:{}};}
      if(/^\/api\/v1\/menu\/groups\/\d+\/items$/.test(p)&&method==='POST'){const id=Number(p.split('/')[5]);const group=menus.flatMap(m=>m.groups).find(g=>g.id===id);for(const itemId of body.item_ids){const item=items.find(i=>i.id===itemId);if(item&&!group.items.some(i=>i.id===itemId))group.items.push(item);const membership=memberships[id]?.find(m=>m.menu_item_id===itemId);if(membership)Object.assign(membership,{effective_from:body.effective_from??'',effective_until:body.effective_until??''});else(memberships[id]??=[]).push({id:100+itemId,menu_group_id:id,menu_item_id:itemId,sort_order:group.items.length,effective_from:body.effective_from??'',effective_until:body.effective_until??''});}return {json:{}};}
      if(/^\/api\/v1\/menu\/groups\/\d+\/items\/\d+$/.test(p)&&method==='DELETE'){const id=Number(p.split('/')[5]);const itemId=Number(p.split('/').pop());const group=menus.flatMap(m=>m.groups).find(g=>g.id===id);const cutoff=q.get('effective_until');if(cutoff){const membership=memberships[id]?.find(m=>m.menu_item_id===itemId);if(membership)membership.effective_until=cutoff;}else{group.items=group.items.filter(i=>i.id!==itemId);memberships[id]=memberships[id]?.filter(m=>m.menu_item_id!==itemId)??[];}return {json:{}};}
      if(p==='/api/v1/menu/menus/reorder'&&method==='POST'){menus.sort((a,b)=>body.menu_ids.indexOf(a.id)-body.menu_ids.indexOf(b.id));return {json:{}};}
      if(p==='/api/v1/menu/menus'&&method==='POST'){const menu={id:menus.length+1,categories:[],groups:[],items:[],...body};menus.push(menu);menuHours[menu.id]=[];menuLocations[menu.id]=[];return {json:{menu}};}
      if(/^\/api\/v1\/menu\/menus\/\d+\/duplicate$/.test(p)&&method==='POST'){const source=menus.find(m=>m.id===Number(p.split('/')[5]));const menu={...source,id:menus.length+1,name:source.name+' (copie)'};menus.push(menu);menuHours[menu.id]=menuHours[source.id];menuLocations[menu.id]=menuLocations[source.id];return {json:{menu}};}
      if(/^\/api\/v1\/menu\/menus\/\d+\/hours$/.test(p)&&method==='PUT'){const id=Number(p.split('/')[5]);menuHours[id]=body.map((h,i)=>({...h,id:i+1,menu_id:id}));return {json:{hours:menuHours[id]}};}
      if(/^\/api\/v1\/menu\/menus\/\d+\/locations$/.test(p)&&method==='PUT'){const id=Number(p.split('/')[5]);menuLocations[id]=body.location_ids;return {json:{locations:locations.filter(l=>body.location_ids.includes(l.id))}};}
      if(/^\/api\/v1\/menu\/menus\/\d+$/.test(p)){const index=menus.findIndex(m=>m.id===Number(p.split('/').pop()));if(method==='DELETE'){if(index>=0)menus.splice(index,1);return {json:{}};}if(method==='PUT'&&index>=0){Object.assign(menus[index],body);return {json:{menu:menus[index]}};}}
      if(p==='/api/v1/menus/rotation-schedules'&&method==='PUT'){
        const existing=rotationSchedules.find(s=>s.rotation_group===body.rotation_group&&s.week_start===body.week_start);
        const schedule={id:existing?.id??rotationSchedules.length+1,restaurant_id:restaurantId,created_at:now.toISOString(),...body};
        if(existing)Object.assign(existing,schedule);else rotationSchedules.push(schedule);return {json:{schedule}};
      }
      if(/^\/api\/v1\/menus\/rotation-schedules\/\d+$/.test(p)&&method==='DELETE'){const i=rotationSchedules.findIndex(s=>s.id===Number(p.split('/').pop()));if(i>=0)rotationSchedules.splice(i,1);return {json:{}};}
      if(p==='/api/v1/menus/rotation-groups/rename'&&method==='PUT'){for(const item of items)if(item.rotation_group===body.old_name)item.rotation_group=body.new_name;for(const schedule of rotationSchedules)if(schedule.rotation_group===body.old_name)schedule.rotation_group=body.new_name;return {json:{}};}
      if(p.startsWith('/api/v1/menus/rotation-groups/')&&method==='DELETE'){const name=decodeURIComponent(p.split('/').pop());for(const item of items)if(item.rotation_group===name)item.rotation_group=null;for(let i=rotationSchedules.length-1;i>=0;i--)if(rotationSchedules[i].rotation_group===name)rotationSchedules.splice(i,1);return {json:{}};}
      if(p==='/api/v1/menu/categories'&&method==='POST'){const category={id:3,items:[],sort_order:3,...body};categories.push(category);return {json:{category}};}
      if(/^\/api\/v1\/menu\/categories\/\d+$/.test(p)) {
        const index=categories.findIndex(c=>c.id===Number(p.split('/').pop()));
        if(method==='DELETE'){if(index>=0)categories.splice(index,1);return {json:{}};}
        if(method==='PUT'&&index>=0){Object.assign(categories[index],body);return {json:{category:categories[index]}};}
      }
      if(p==='/api/v1/menu/modifiers'&&method==='POST'){const modifier={id:22,...body};const item=items.find(i=>i.id===body.menu_item_id);item?.modifiers.push(modifier);return {json:{modifier}};}
      if(/^\/api\/v1\/menu\/modifiers\/\d+$/.test(p)&&method==='DELETE'){for(const item of items){const i=item.modifiers.findIndex(m=>m.id===Number(p.split('/').pop()));if(i>=0)item.modifiers.splice(i,1);}return {json:{}};}
      if(p==='/api/v1/menu/image-prompts'&&method==='POST'){const prompt={id:2,restaurant_id:restaurantId,...body,created_at:now.toISOString(),updated_at:now.toISOString()};if(body.is_default)imagePrompts.forEach(p=>p.is_default=false);imagePrompts.push(prompt);return {json:prompt};}
      if(/^\/api\/v1\/menu\/image-prompts\/\d+$/.test(p)){
        const index=imagePrompts.findIndex(i=>i.id===Number(p.split('/').pop()));
        if(method==='DELETE'){if(index>=0)imagePrompts.splice(index,1);return {json:{}};}
        if(method==='PUT'&&index>=0){if(body.is_default)imagePrompts.forEach(p=>p.is_default=false);Object.assign(imagePrompts[index],body);return {json:imagePrompts[index]};}
      }
      if(p==='/api/v1/restaurants/1/staff/table-assignment-mode'&&method==='PUT'){tableMode=body.mode;return {json:{mode:tableMode}};}
      if(p==='/api/v1/restaurants/1/staff/2/table-assignments'&&method==='PUT'){tableAssignment={user_id:2,...body,effective_table_ids:body.floor_plan_ids.length||body.section_ids.length?[1,2]:body.table_ids};return {json:{assignment:tableAssignment}};}
      if(p==='/api/v1/restaurants/1/pos-devices/1'&&method==='DELETE'){posDevices[0].revoked_at=new Date().toISOString();return {json:{}};}
      if(p==='/api/v1/restaurants/1/staff/invite') {const member={id:staff.length+1,...body,role:'manager',role_name:roles.find(role=>role.id===body.role_id)?.name??'',invite_status:'pending',pos_pin_configured:false,table_assignment_eligible:false,unrestricted_table_access:false};staff.push(member);return {json:{staff_member:member,email_status:'not_configured'}};}
      if(/^\/api\/v1\/restaurants\/1\/staff\/\d+\/role$/.test(p)&&method==='PUT') {const member=staff.find(member=>member.id===Number(p.split('/')[6]));if(member)Object.assign(member,body);return {json:{}};}
      if(/^\/api\/v1\/restaurants\/1\/staff\/\d+\/resend-invite$/.test(p)) return {json:{email_status:'not_configured'}};
      if(/^\/api\/v1\/restaurants\/1\/staff\/\d+$/.test(p)&&method==='DELETE') {const index=staff.findIndex(member=>member.id===Number(p.split('/').pop()));if(index>=0)staff.splice(index,1);return {json:{}};}
      if(p==='/api/v1/restaurants/1/roles'&&method==='POST'){const role={...body,id:3,restaurant_id:1,is_system_default:false,permissions:body.permissions.map((permission,i)=>({id:10+i,restaurant_role_id:3,permission})),user_count:0,created_at:now.toISOString()};roles.push(role);return {json:{role}};}
      if(/^\/api\/v1\/restaurants\/1\/roles\/\d+$/.test(p)) {
        const index=roles.findIndex(role=>role.id===Number(p.split('/').pop()));
        if(method==='DELETE'){if(index>=0)roles.splice(index,1);return {json:{}};}
        if(method==='PUT'&&index>=0){const role=roles[index];Object.assign(role,body,{permissions:body.permissions.map((permission,i)=>({id:20+i,restaurant_role_id:role.id,permission}))});return {json:{role}};}
      }
      if(p==='/api/v1/stock/daily-reports/1/compute') return response('/api/v1/stock/daily-reports/today');
      if(['/api/v1/auth/setup-account','/api/v1/auth/reset-password'].includes(p)) {
        const staffInvite=body.token==='staff-demo';
        const claims=Buffer.from(JSON.stringify({restaurant_ids:[1,2],exp:Math.floor(Date.now()/1000)+86400})).toString('base64');
        return {json:{token:`fixture.${claims}.not-a-signature`,user:{id:1,full_name:body.full_name??'Équipe démo',role:staffInvite?'waiter':'owner',email:'demo@foody.test'}}};
      }
      if(p==='/api/v1/auth/login') {
        if(body.email!=='demo@foody.test' || body.password!=='demo-local') return {status:401,json:{error:'Identifiants de démonstration incorrects'}};
        const claims=Buffer.from(JSON.stringify({restaurant_ids:[1,2],exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');
        return {json:{token:`fixture.${claims}.not-a-signature`,user:{id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}}};
      }
      if(p==='/api/v1/restaurants/1' && method==='PUT') {Object.assign(restaurant,body);return {json:{restaurant}};}
      if(p==='/api/v1/display-preferences') {preferences={...preferences,...body};return {json:preferences};}
      if(p==='/api/v1/availability/rules' && method==='POST'){if(body.is_default)availabilityRules.forEach(rule=>rule.is_default=false);const rule={...body,id:Math.max(0,...availabilityRules.map(rule=>rule.id))+1,restaurant_id:restaurantId};availabilityRules.push(rule);return {json:{rule}};}
      if(/^\/api\/v1\/availability\/rules\/\d+$/.test(p)){
        const index=availabilityRules.findIndex(rule=>rule.id===Number(p.split('/').pop()));
        if(index<0)return {status:404,json:{error:'Rule not found'}};
        if(method==='DELETE'){if(availabilityRules[index].is_default)return {status:409,json:{error:'Default rule is protected'}};availabilityRules.splice(index,1);return {json:{}};}
        if(method==='PUT'){const wasDefault=availabilityRules[index].is_default;if(body.is_default)availabilityRules.forEach(rule=>rule.is_default=false);Object.assign(availabilityRules[index],body,{is_default:body.is_default||wasDefault});return {json:{rule:availabilityRules[index]}};}
      }
      if(p==='/api/v1/restaurants/1/settings') {settings={...settings,...body};return {json:{settings}};}
      if(/^\/api\/v1\/menu\/items\/\d+$/.test(p) && method==='PUT') {const item=items.find(i=>i.id===Number(p.split('/').pop()));if(item)Object.assign(item,body);return {json:{item}};}
      unhandled.push(`${method} ${p}`);
      return {status:405,json:{error:'This operation is unavailable in the isolated UI fixture'}};
    }
    if(['/api/v1/auth/validate-invite','/api/v1/auth/validate-reset-token'].includes(p)) return {json:{valid:q.get('token')!=='expired-demo',kind:q.get('token')==='staff-demo'?'staff_setup':'owner_onboarding',user:{email:'demo@foody.test',full_name:'Équipe démo',phone:''},restaurant:{id:1,name:'Atelier Foody',slug:'atelier-foody',address:'Adresse de démonstration',phone:'',pos_platform:'ipad'}}};
    if(p==='/api/v1/menu/menus/1/pos-display')return {json:posLayout};
    if(p==='/api/v1/locations')return {json:{locations}};
    if(p==='/api/v1/menu/carte-health')return {json:{serie_date:date,problems:[]}};
    if(/^\/api\/v1\/menu\/menus\/\d+\/hours$/.test(p))return {json:{hours:menuHours[Number(p.split('/')[5])]??[]}};
    if(/^\/api\/v1\/menu\/menus\/\d+\/locations$/.test(p))return {json:{locations:locations.filter(l=>(menuLocations[Number(p.split('/')[5])]??[]).includes(l.id))}};
    if(p==='/api/v1/menus/rotation-schedules')return {json:{schedules:rotationSchedules}};
    if(p==='/api/v1/menu/combo/resolve-preview'){const group=menus.flatMap(m=>m.groups).find(g=>g.id===Number(q.get('source_id')));const rows=(group?.items??[]).filter(i=>i.item_type!=='combo').map(item=>({menu_item_id:item.id,name:item.name,availability_state:'available'}));return {json:{items:rows,count:rows.length}};}
    if(p==='/api/v1/menu/image-prompts')return {json:{prompts:imagePrompts}};
    if(p==='/api/v1/public/pos-downloads')return {json:{macos:{url:'https://downloads.foody.test/foody-demo.dmg',name:'Foody POS démo',version:'1.0'}}};
    if(p==='/api/v1/restaurants/1/staff/table-assignment-mode')return {json:{mode:tableMode}};
    if(p==='/api/v1/restaurants/1/staff/2/table-assignments')return {json:{assignment:tableAssignment}};
    if(p==='/api/v1/restaurants/1/floor-plans')return {json:{floor_plans:floorPlans}};
    if(p==='/api/v1/restaurants/1/sections')return {json:{sections:floorSections}};
    if(p==='/api/v1/restaurants/1/tables')return {json:{tables:floorTables}};
    if(p==='/api/v1/restaurants/1/pos-devices')return {json:{devices:posDevices}};
    if(p==='/api/v1/restaurants/1/shifts')return {json:{shifts}};
    if(p==='/api/v1/permissions')return {json:{permissions:permissionsCatalog}};
    if(p==='/api/v1/restaurants/1/staff')return {json:{staff}};
    if(p==='/api/v1/restaurants/1/roles')return {json:{roles}};
    if(p==='/api/v1/chain/branches') return {json:{chain_id:1,chain_name:'Foody démo',public_enabled:false,branches:[{id:1,name:'Atelier Foody',is_current:restaurantId===1,is_active:true},{id:2,name:'Jardin Foody',is_current:restaurantId===2,is_active:true}]}};
    if(p==='/api/v1/stock/daily-reports/today') return {json:{report:{id:1,restaurant_id:1,report_date:date,status:'open',sales_source:'pos',total_theoretical_cost:0,total_actual_cost:0,total_sales_revenue:0,total_waste_value:0,total_variance_value:0,food_cost_percent:0,went_well:'',went_wrong:'',to_improve:'',closed_by_id:null,closed_at:null,created_by_id:1,created_at:now.toISOString(),updated_at:now.toISOString(),items:[],sales:[]}}};
    if(p==='/api/v1/stock/daily-reports/1/kitchen-summary') return {json:{summary:{stocks:[],preparations:preps.map((p,i)=>({prep_item_id:p.id,name:p.name,unit:p.unit,target_qty:[12,8,40][i],produced_qty:p.quantity,waste_qty:0,remaining_qty:p.quantity})),unmapped_sales:0}}};
    if(p==='/api/v1/stock/forecast') return {json:{forecast:{target_date:date,day_of_week:String(now.getDay()),top_items:[],weeks_analyzed:0,sample_days:0}}};
    if(/^\/api\/v1\/prep\/items\/\d+$/.test(p))return {json:{item:preps.find(i=>i.id===Number(p.split('/')[5]))}};
    if(/^\/api\/v1\/prep\/items\/\d+\/ingredients$/.test(p))return {json:{ingredients:prepRecipes[Number(p.split('/')[5])]??[]}};
    if(/^\/api\/v1\/prep\/items\/\d+\/steps$/.test(p))return {json:{steps:prepSteps[Number(p.split('/')[5])]??[]}};
    if(p==='/api/v1/prep/items') return {json:{items:preps}};
    if(p==='/api/v1/prep/daily-plan') return {json:{items:plans}};
    if(p==='/api/v1/menu/option-sets') return {json:{option_sets:optionSets}};
    if(p==='/api/v1/menu/option-sets/1') return {json:{option_set:optionSets[0]}};
    if(p==='/api/v1/menu/modifier-sets') return {json:{modifier_sets:modifierSets}};
    if(p==='/api/v1/menu/modifier-sets/1') return {json:{modifier_set:modifierSets[0]}};
    if(/^\/api\/v1\/menu\/groups\/\d+\/memberships$/.test(p))return {json:{memberships:(memberships[Number(p.split('/')[5])]??[]).map(member=>({...member,item:items.find(item=>item.id===member.menu_item_id)}))}};
    if(/^\/api\/v1\/menu\/groups\/\d+\/hours$/.test(p))return {json:{hours:groupHours[Number(p.split('/')[5])]??[]}};
    if(p==='/api/v1/public/restaurants/1/batch-fulfillment-config')return {json:batchConfig};
    if(p===`/api/v1/restaurants/${restaurantId}/search`) return {json:{query:q.get('q'),groups:q.get('q')?.toLowerCase().includes('sal') ? [{type:'item',label:'Articles',items:[{id:'item-1',title:items[0]?.name??'Salade',subtitle:'Cuisine',url:`/${restaurantId}/menu/items/1`}]}] : []}};
    if(p==='/api/v1/restaurants/1/staff-batch-fulfillment-config')return {json:{enabled:false,ordering_open:true,fulfillment_days:[],next_fulfillment_days:[],upcoming_cycles:[],require_prepayment:false}};
    if(p==='/api/v1/users/me') return {json:{permissions:permissions??(denied?['orders.view']:['*']),role_name:permissions||denied?'Observer':'Owner',user:{id:1,full_name:'Équipe démo',role:'owner'}}};
    if(/^\/api\/v1\/restaurants\/[12]$/.test(p)) return {json:{restaurant:{...restaurant,id:Number(p.split('/').pop()),name:p.endsWith('/2')?'Jardin Foody':restaurant.name}}};
    if(p.endsWith('/settings')) return {json:{settings}};
    if(p==='/api/v1/display-preferences') return {json:preferences};
    if(p==='/api/v1/analytics/comparison') {
      const day=(date,previous=false)=>({date,gross_sales:empty?0:previous?6200:6840,net_sales:empty?0:previous?6200:6840,transactions:empty?0:previous?76:84,avg_sale:81.43,items_sold:empty?0:162,tips:0,discounts:0,labor_percent:0});
      return {json:{current:day(q.get('date')),previous:day(q.get('compare'),true),hourly:Array.from({length:24},(_,hour)=>({hour,current_count:empty||hour<11||hour>19?0:hour-7,previous_count:empty||hour<11||hour>19?0:hour-9,current_amt:empty||hour<11||hour>19?0:(hour-7)*80,previous_amt:empty||hour<11||hour>19?0:(hour-9)*80}))}};
    }
    if(p==='/api/v1/analytics/period') return {json:{current:summary,previous:empty?null:{...summary,total_revenue:6200,total_orders:76,avg_ticket:81.58,items_sold:146}}};
    if(p==='/api/v1/analytics/top-sellers') return {json:{top_items:items.map((i,n)=>({item_id:i.id,name:i.name,quantity:35-n*8,revenue:(35-n*8)*i.price}))}};
    if(p==='/api/v1/analytics/daily') return {json:{days:empty?[]:Array.from({length:7},(_,i)=>({date:new Date(now.getTime()-(6-i)*86400000).toISOString().slice(0,10),gross_sales:[4100,5400,3900,6200,7800,6050,6840][i],transactions:60+i*4,avg_sale:81,items_sold:120}))}};
    if(p.startsWith('/api/v1/analytics/items')) {
      const sales=items.map((item,i)=>({menu_item_id:item.id,name:item.name,category_name:categories.find(category=>category.id===item.category_id)?.name??'',quantity:30-i*5,revenue:(30-i*5)*item.price,avg_price:item.price,order_count:24-i*4,combo_quantity:i===0?5:0,combo_revenue:i===0?180:0,pct_of_revenue:[52.56,38.32,9.12][i]}));
      if(p==='/api/v1/analytics/items') {
        const filtered=sales.filter(item=>item.name.toLowerCase().includes((q.get('search')??'').toLowerCase()));
        const sort=q.get('sort_by')??'quantity';filtered.sort((a,b)=>(typeof a[sort]==='number'?a[sort]-b[sort]:String(a[sort]).localeCompare(String(b[sort])))*(q.get('sort_dir')==='asc'?1:-1));
        const revenue=sales.reduce((total,item)=>total+item.revenue,0);
        return {json:{items:filtered,total:filtered.length,page:Number(q.get('page')??1),per_page:50,total_revenue:revenue,total_quantity:sales.reduce((total,item)=>total+item.quantity,0),items_sold:sales.length,gross_revenue:revenue+(empty?0:60),delivery_total:empty?0:80,discount_total:empty?0:20,combo_extras_total:0,combo_quantity_total:empty?0:5,combo_revenue_total:empty?0:180}};
      }
      const item=sales.find(item=>item.menu_item_id===Number(p.split('/').pop()));
      return {json:{item:item?{...item,daily:Array.from({length:12},(_,i)=>({date:new Date(now.getTime()-(11-i)*86400000).toISOString().slice(0,10),quantity:i+1,revenue:(i+1)*item.avg_price})),top_customers:[{customer_phone:'demo-1',customer_name:'Client de démonstration — réception de l’équipe',orders:6,quantity:8,revenue:384,combo_quantity:2,combo_revenue:72}],order_type_breakdown:{dine_in:50,pickup:30,delivery:20},order_source_breakdown:{manual:65,website_order:35},variants:[{variant_name:'Individuelle',quantity:20,revenue:960,combo_quantity:5,combo_revenue:180},{variant_name:'À partager',quantity:10,revenue:480,combo_quantity:0,combo_revenue:0}]}:null}};
    }
    if(p.startsWith('/api/v1/analytics/customers')) {
      const customers=empty?[]:Array.from({length:3},(_,i)=>({customer_phone:`demo-${i+1}`,customer_name:['Client de démonstration — réception de l’équipe','לקוח לדוגמה · Équipe Foody','Client démo'][i],total_orders:16-i*5,total_spent:1280-i*400,avg_order_value:80,first_order_date:'2025-01-10T12:00:00Z',last_order_date:now.toISOString(),days_since_last_order:[4,40,85][i],favorite_items:items.slice(0,2).map(item=>({menu_item_id:item.id,name:item.name,quantity:4})),order_type_breakdown:{dine_in:50,pickup:30,delivery:20},payment_method_breakdown:{card:75,cash:25},order_source_breakdown:{manual:65,website_order:35},preferred_day_of_week:'',preferred_hour:12}));
      if(p==='/api/v1/analytics/customers') {
        const filtered=customers.filter(customer=>`${customer.customer_name} ${customer.customer_phone}`.toLowerCase().includes((q.get('search')??'').toLowerCase()));
        const sort=q.get('sort_by')??'total_spent';filtered.sort((a,b)=>(typeof a[sort]==='number'?a[sort]-b[sort]:String(a[sort]).localeCompare(String(b[sort])))*(q.get('sort_dir')==='asc'?1:-1));
        return {json:{customers:filtered,total:filtered.length,page:1,per_page:50,total_active:empty?0:1,total_at_risk:empty?0:1,total_churned:empty?0:1}};
      }
      const customer=customers.find(customer=>customer.customer_phone===decodeURIComponent(p.split('/').pop()));
      return {json:{customer:customer?{...customer,orders:orders.slice(0,4).map(order=>({...order,item_count:3})),product_breakdown:items.map(item=>({menu_item_id:item.id,name:item.name,times_ordered:3,total_quantity:4,total_spent:4*item.price})),monthly_spending:[{month:'2026-07',total_spent:180,order_count:3},{month:'2026-08',total_spent:640,order_count:8},{month:'2026-09',total_spent:460,order_count:5}],addresses:[{address:'Adresse de démonstration — salle de réception',city:'Ville démo',floor:'2',apt:'',entry_code:'',order_count:3,last_used:now.toISOString()}]}:null}};
    }
    if(p==='/api/v1/analytics/breakdown') {
      const dimension=q.get('dimension');
      const rows=[{key:'dine_in',label:'Sur place',orders:44,revenue:3840},{key:'pickup',label:'À emporter',orders:25,revenue:1900},{key:'delivery',label:'Livraison',orders:15,revenue:1100}];
      if(['month','week','day','serie'].includes(dimension)) rows.forEach((r,i)=>{r.key=dimension==='month'?new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-2+i,1)).toISOString().slice(0,7):new Date(now.getTime()-(2-i)*86400000).toISOString().slice(0,10);r.label=r.key;});
      return {json:{dimension,rows:empty?[]:rows,total:{orders:summary.total_orders,revenue:summary.total_revenue}}};
    }
    if(p==='/api/v1/orders') {let list=orders.filter(o=>(!q.get('status')||q.get('status').split(',').includes(o.status))&&(!q.get('q')||o.customer_name.toLowerCase().includes(q.get('q').toLowerCase()))&&(!q.get('type')||o.order_type===q.get('type'))&&(!q.get('payment_status')||q.get('payment_status').split(',').includes(o.payment_status)));return {json:{orders:list.slice(Number(q.get('offset')||0),Number(q.get('offset')||0)+Number(q.get('limit')||25)),total:list.length}};}
    if(/^\/api\/v1\/orders\/\d+$/.test(p)) return {json:{order:orders.find(o=>o.id===Number(p.split('/').pop()))??orders[0]}};
    if(/^\/api\/v1\/recipes\/items\/\d+\/steps$/.test(p)) return {json:{steps:recipeSteps[Number(p.split('/')[5])]??[]}};
    if(p==='/api/v1/availability/rules') return {json:{rules:availabilityRules}};
    if(/^\/api\/v1\/availability\/items\/\d+\/preview$/.test(p)) return {json:{buildable:48,unlimited:false,bottleneck:'Tomates de saison',state:'available',count:48,basis:'recipe',ingredients:[]}};
    if(p==='/api/v1/menu/items') return {json:{items}};
    if(/^\/api\/v1\/menu\/items\/\d+$/.test(p)) return {json:{item:items.find(i=>i.id===Number(p.split('/').pop()))??items[0]}};
    if(p==='/api/v1/menu/item-categories') return {json:{categories}};
    if(p==='/api/v1/menu' || p==='/api/v1/menu/menus') return {json:{menus:menus.map(menu=>({...menu,availability_hours:menuHours[menu.id]??[]}))}};
    if(p.endsWith('/website-config')) return {json:{config:{},website_config:{}}};
    if(/^\/api\/v1\/stock\/menu-items\/[123]\/ingredients$/.test(p)) return {json:{ingredients:empty?[]:recipeByItem[Number(p.split('/')[5])]??[]}};
    if(/^\/api\/v1\/menu\/items\/[123]\/option-prices$/.test(p)) return {json:{item_options:itemOptionOverrides[Number(p.split('/')[5])]??[]}};
    if(p==='/api/v1/ingredient-icons')return {json:{icons:[{id:1,name:'Tomates de saison',category:'Légumes',slug:'tomate',aliases:['tomate','עגבנייה'],image_url:'/brand/favicon.svg',tags:[],created_at:now.toISOString(),updated_at:now.toISOString()}]}};
    if(p==='/api/v1/stock/categories')return {json:{categories:[...stockCategories,...Array.from(new Set(stock.map(item=>item.category))).filter(name=>stockLibrary&&!stockCategories.some(value=>value.name===name)).map(name=>({id:0,name,color:''}))]}};
    if(p==='/api/v1/stock/transactions')return {json:{transactions:stockTransactions.filter(value=>!q.get('stock_item_id')||String(value.stock_item_id)===q.get('stock_item_id'))}};
    if(p==='/api/v1/stock/items')return {json:{items:stock,total:stock.length}};
    if(p.endsWith('/low-stock/count') || p.endsWith('/low-stock-count')) return {json:{count:0}};
    if(p==='/api/v1/units') return {json:{units:customUnits}};
    const lists={
      '/api/v1/order-workflows':'workflows','/api/v1/orders/1048/audit':'events','/api/v1/orders/1048/notes':'notes',
      '/api/v1/discounts':'discounts','/api/v1/purchase-orders':'orders','/api/v1/stock/transactions':'transactions',
      '/api/v1/menu/items/1/option-prices':'item_options','/api/v1/stock/menu-items/1/ingredients':'ingredients',
      '/api/v1/menu/modifier-sets':'modifier_sets','/api/v1/menu/options':'options','/api/v1/menu/option-sets':'option_sets',
      '/api/v1/stock/items':'items','/api/v1/prep/items':'items','/api/v1/prep/daily-plan':'items',
      '/api/v1/suppliers':'suppliers','/api/v1/stock/categories':'categories','/api/v1/prep/categories':'categories',
      '/api/v1/units':'units','/api/v1/stock/units':'units','/api/v1/order-series':'series','/api/v1/orders/series':'series',
      '/api/v1/customers':'customers','/api/v1/restaurants/1/staff':'staff','/api/v1/restaurants/1/roles':'roles',
      '/api/v1/restaurants/1/tables':'tables','/api/v1/restaurants/1/sections':'sections',
    };
    if(lists[p])return {json:{[lists[p]]:[],total:0}};
    unhandled.push(p);return {status:501,json:{error:`Missing isolated fixture: ${p}`}};
  }
  return {response,writes,unhandled,items,orders,staff,roles,posDevices,shifts,categories,imagePrompts,rotationSchedules,menus,menuHours,menuLocations,batchConfig,memberships,groupHours,recipeSteps,availabilityRules,recipeByItem,optionSets,stock,preps,recipeExtraction,prepSteps,customUnits,stockTransactions,stockCategories};
}
