import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
const bill='00000000-0000-4000-8000-000000000099';
function facts(parent=false) {
 const axis=(state:string)=>({state,evidence:[]});
 return {schema_version:2,scope:{kind:'order',id:'1048'},identities:{order_ids:[1048],...(parent?{financial_check_ids:[bill]}:{})},revision:'a'.repeat(64),
 commercial:{...axis('open'),editable:true,closed_at:null as string|null},payment:{...axis('partially_refunded'),amounts:{availability:'known',currency:'ILS',minor_unit_exponent:2,total_minor:10000,captured_minor:10000,refunded_minor:2500,net_received_minor:7500,balance_due_minor:0}},
 preparation:{...axis('partially_ready'),quantities:{total:2,not_sent:0,held:1,in_progress:0,ready:1,not_tracked:0,unknown:0}},
 handoff:{...axis('pending'),tracking:'tracked',quantities:{total:2,pending:2,with_courier:0,served:0,picked_up:0,delivered:0,not_tracked:0,unknown:0}},tracking:{state:'snapshot',preparation:'tracked',handoff:'tracked',captured_at:'2026-10-28T10:00:00Z'},
 units:[{key:'hu_'+'1'.repeat(64),order_id:1048,order_item_id:1,name:'Entrée synthétique',details:[],quantity:1,preparation_state:'ready',handoff_state:'pending',available_actions:['serve']},{key:'hu_'+'2'.repeat(64),order_id:1048,order_item_id:2,name:'Plat retenu',details:[],quantity:1,preparation_state:'held',handoff_state:'pending',available_actions:[]}],
 actions:[{key:'serve',allowed:true,reason:''},{key:'close_check',allowed:!parent,reason:parent?'review_parent_check':''}]};
}
async function install(page:Page, options:{parent?:boolean;uncertain?:boolean;locale?:string;committedLostClose?:boolean;denyParentClose?:boolean}={}) {
 const fixture=createFixture({empty:false});let value=facts(options.parent);const posts:any[]=[];const verifications:string[]=[];const receipts=new Map<string,unknown>();
 if(options.committedLostClose)value={...value,preparation:{...value.preparation,state:'ready',quantities:{...value.preparation.quantities,held:0,ready:2}},handoff:{...value.handoff,state:'complete',quantities:{...value.handoff.quantities,pending:0,served:2}},units:value.units.map(unit=>({...unit,preparation_state:'ready',handoff_state:'served',available_actions:[]})),actions:value.actions.map(action=>action.key==='serve'?{...action,allowed:false}:action)};
 Object.assign(fixture.orders[0],{status:'served',payment_status:'paid',lifecycle_v2:value});
 await page.addInitScript(locale=>{
  const payload=btoa(JSON.stringify({sub:'user-auth',user_id:1,exp:4102444800}));
  localStorage.setItem('foody_restaurant_token',`synthetic.${payload}.signature`);localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Synthetic',role:'owner'}));localStorage.setItem('foody_restaurant_ids','[1]');localStorage.setItem('foody-admin-locale',locale);
 },options.locale??'fr');
 await page.route('**/*',route=>['localhost','127.0.0.1','square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.postDataJSON()??{};
  if(url.pathname==='/api/v1/orders/lifecycle-v2'&&request.method()==='GET') {
   const scoped=url.searchParams.get('scope')==='financial_check'?{...value,scope:{kind:'financial_check',id:bill},identities:{order_ids:[1048,1049],financial_check_ids:[bill]},actions:value.actions.map(action=>action.key==='close_check'?{...action,allowed:!options.denyParentClose,reason:options.denyParentClose?'balance_unknown_or_due':''}:action)}:value;
   return route.fulfill({json:{lifecycle_v2:scoped}});
  }
  if(url.pathname.includes('/lifecycle-v2/operations/')) {verifications.push(url.pathname);const saved=receipts.get(url.pathname.split('/').at(-1)!);if(saved)return route.fulfill({json:saved});return route.fulfill({status:202,json:{schema_version:2,request_id:url.pathname.split('/').at(-1),scope:{kind:'order',id:'1048'},state:'unconfirmed'}});}
  if(url.pathname==='/api/v1/orders/lifecycle-v2/handoff'||url.pathname==='/api/v1/orders/lifecycle-v2/close') {
   posts.push(body);
   if(options.uncertain&&posts.length===1)return route.fulfill({status:503,json:{details:{code:'lifecycle_operation_unconfirmed'}}});
   if(url.pathname.endsWith('/close'))value={...value,revision:'b'.repeat(64),commercial:{...value.commercial,state:'closed',editable:false,closed_at:'2026-10-28T11:00:00Z'},actions:value.actions.map(action=>action.key==='close_check'?{...action,allowed:false}:action)};
   else value={...value,revision:'b'.repeat(64),handoff:{...value.handoff,state:'partially_complete',quantities:{...value.handoff.quantities,pending:1,served:1}},units:value.units.map(unit=>unit.key===body.unit_keys[0]?{...unit,handoff_state:'served',available_actions:[]}:unit),actions:value.actions.map(action=>action.key==='serve'?{...action,allowed:false}:action)};
   const result=body.scope.kind==='financial_check'?{...value,scope:body.scope,identities:{order_ids:[1048,1049],financial_check_ids:[bill]},actions:value.actions.map(action=>action.key==='close_check'?{...action,allowed:!options.denyParentClose,reason:options.denyParentClose?'balance_unknown_or_due':''}:action)}:value;
   Object.assign(fixture.orders[0],{lifecycle_v2:value});
   const receipt={schema_version:2,request_id:body.request_id,scope:body.scope,state:'confirmed',revision:value.revision,lifecycle_v2:result};receipts.set(body.request_id,receipt);
   if(options.committedLostClose&&posts.length===1)return route.fulfill({status:503,json:{details:{code:'lifecycle_operation_unconfirmed'}}});
   return route.fulfill({json:receipt});
  }
  const result=fixture.response(request.url(),request.method(),body,Number(request.headers()['x-restaurant-id'])||1);
  return route.fulfill({status:result.status??200,json:result.json??{}});
 });
 return {posts,verifications};
}

test('partial handoff selects one original unit and retains money and held work',async({page},info)=>{
 const {posts}=await install(page);await page.setViewportSize({width:390,height:1000});await page.goto('/1/orders/1048');
 const detail=page.getByRole('dialog').first();await expect(detail.getByText('Partiellement remboursé',{exact:true}).first()).toBeVisible();
 await expect(detail.locator('[data-money-field="refunded_minor"]')).toContainText('25');
 await detail.getByRole('button',{name:'Confirmer le service',exact:true}).click();
 const review=page.getByRole('dialog').last();await expect(review.getByText('Sélectionnez les articles réellement remis.')).toBeVisible();
 await expect(review.getByRole('checkbox')).toHaveCount(1);await review.getByRole('checkbox',{name:/Entrée synthétique/}).check();
 await review.getByRole('button',{name:'Confirmer',exact:true}).click();await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0].unit_keys).toEqual(['hu_'+'1'.repeat(64)]);expect(posts[0].scope).toEqual({kind:'order',id:'1048'});expect(posts[0].action).toBe('serve');
 await expect(review.getByText('Partiellement remise',{exact:true})).toBeVisible();await expect(review.getByText('1 / 2 remis',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('partial-handoff-fr-mobile.png')});
});

test('uncertain operation survives reload and only an explicit same-UUID resume can dispatch again',async({page})=>{
 const {posts,verifications}=await install(page,{uncertain:true});await page.goto('/1/orders/1048');
 await page.getByRole('dialog').first().getByRole('button',{name:'Confirmer le service',exact:true}).click();
 let review=page.getByRole('dialog').last();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmer',exact:true}).click();
 await expect(review.getByRole('button',{name:'Vérifier le résultat',exact:true})).toBeVisible();expect(posts).toHaveLength(1);
 const original=structuredClone(posts[0]);await page.reload();await page.getByRole('dialog').first().getByRole('button',{name:'Confirmer le service',exact:true}).click();
 review=page.getByRole('dialog').last();await expect(review.getByRole('button',{name:'Vérifier le résultat',exact:true})).toBeVisible();expect(posts).toHaveLength(1);
 await review.getByRole('button',{name:'Vérifier le résultat',exact:true}).click();await expect(review.getByRole('button',{name:'Reprendre la même opération',exact:true})).toBeVisible();
 expect(verifications).toHaveLength(1);expect(posts).toHaveLength(1);
 await review.getByRole('button',{name:'Reprendre la même opération',exact:true}).click();await expect.poll(()=>posts.length).toBe(2);expect(posts[1]).toEqual(original);
});

test('a linked child cannot close its parent without reviewing the real compound scope',async({page},info)=>{
 const {posts}=await install(page,{parent:true,locale:'he'});await page.setViewportSize({width:1024,height:900});await page.goto('/1/orders/1048');
 const detail=page.getByRole('dialog').first();await expect(detail.getByRole('button',{name:'סגירת ההזמנה הזאת',exact:true})).toHaveCount(0);
 await detail.getByRole('button',{name:'עיון בחשבון',exact:true}).click();let review=page.getByRole('dialog').last();await review.getByRole('button',{name:'חשבון 1',exact:true}).click();
 await expect(review.getByText(/#1048, #1049/)).toBeVisible();await page.screenshot({path:info.outputPath('parent-bill-review-he.png')});
 await review.getByRole('button',{name:'אישור',exact:true}).click();await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0]).toEqual({request_id:expect.any(String),scope:{kind:'financial_check',id:bill},expected_revision:'a'.repeat(64)});
});


test('committed close with lost response remains recoverable after reload even without any available action',async({page})=>{
 const {posts,verifications}=await install(page,{committedLostClose:true});await page.goto('/1/orders/1048');
 await page.getByRole('dialog').first().getByRole('button',{name:'Clôturer cette commande',exact:true}).click();
 let review=page.getByRole('dialog').last();await review.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(review.getByRole('button',{name:'Vérifier le résultat',exact:true})).toBeVisible();
 const requestId=posts[0].request_id;await page.reload();
 const detail=page.getByRole('dialog').first();await expect(detail.getByRole('button',{name:'Clôturer cette commande',exact:true})).toHaveCount(0);await expect(detail.getByRole('button',{name:'Confirmer le service',exact:true})).toHaveCount(0);
 await detail.getByRole('button',{name:'Vérifier une opération en attente',exact:true}).click();review=page.getByRole('dialog').last();await review.getByRole('button',{name:'Vérifier le résultat',exact:true}).click();
 await expect(review.getByText('Opération confirmée.',{exact:true})).toBeVisible();await expect(review.getByText('Clôturée',{exact:true})).toBeVisible();expect(posts).toHaveLength(1);expect(verifications[0]).toContain(requestId);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('foody-lifecycle-intent-v2:')).length)).toBe(0);
});

test('a denied reviewed close explains its actual balance guard without exposing a backend code',async({page})=>{
 const {posts}=await install(page,{parent:true,denyParentClose:true});await page.goto('/1/orders/1048');await page.getByRole('dialog').first().getByRole('button',{name:'Revoir l’addition',exact:true}).click();
 const review=page.getByRole('dialog').last();await review.getByRole('button',{name:'Addition 1',exact:true}).click();
 await expect(review.getByText('Le solde doit être connu et entièrement réglé avant la clôture.',{exact:true})).toBeVisible();await expect(review.getByRole('button',{name:'Confirmer',exact:true})).toBeDisabled();await expect(review).not.toContainText('balance_unknown_or_due');expect(posts).toHaveLength(0);
});
