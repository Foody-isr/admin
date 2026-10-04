import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const names=['Client démo — réception de l’équipe','לקוח לדוגמה · Beta','Gamma démo'];
const phones=['0500000001','0500000002','0500000003'];
async function installCustomers(page:Page,options:{locale?:string;theme?:string;readOnly?:boolean;empty?:boolean}={}) {
 const fixtureOptions={empty:false,permissions:options.readOnly?['customers.view']:undefined};
 const fixture=createFixture(fixtureOptions);
 const customers=phones.map((phone,index)=>({customer_phone:phone,customer_name:names[index],total_orders:10-index*3,total_spent:800-index*100,last_order_date:'2026-10-01T10:00:00Z',address:'Rue de démonstration 12',city:'Ville démo',floor:'2',apt:'4',entry_code:'AB12',phones:index===0?[phone,'0500000004']:[phone]}));
 const trusted=[{id:51,phone:'+972500000001',name:names[0],notes:'Note initiale',restaurant_id:1},{id:52,phone:'0500000009',name:'Client ajouté sans commande',notes:'',restaurant_id:1}];
 let groups=[{reason:'same_name',value:'Démo',customers:customers.map(customer=>({phone:customer.customer_phone,name:customer.customer_name,order_count:customer.total_orders,total_spent:customer.total_spent,last_order_at:customer.last_order_date}))}];
 const profiles=new Map(phones.map((phone,index)=>[phone,{account_id:null,has_account:false,name:names[index],phone,address:'',city:'',floor:'',apt:'',entry_code:'',delivery_notes:'',last_delivery:{address:'Rue de démonstration 12',city:'Ville démo',floor:'2',apt:'4',entry_code:'AB12',delivery_notes:'Entrée latérale'}}]));
 if(options.empty){customers.length=0;trusted.length=0;groups=[];}
 const writes:{path:string;method:string;body:any;restaurant:number;query:string}[]=[];
 const reads:{path:string;restaurant:number;query:string}[]=[];
 const faults={list:0,profile:0,profileSave:0,trustedGet:0,trustedPost:0,trustedDelete:0,duplicates:0,dismissNth:0,merge:0,detach:0,refreshAfterCreate:0,refreshAfterMerge:0,refreshAfterDetach:0,writeDelay:0,searchDelay:0,profileDelay:0};
 let dismisses=0;let total=customers.length;
 await page.addInitScript(({locale,theme})=>{localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}));localStorage.setItem('foody_restaurant_ids','[1,2]');localStorage.setItem('foody-admin-locale',locale);localStorage.setItem('foody_admin_theme',theme);},{locale:options.locale??'fr',theme:options.theme??'light'});
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method(),body=request.postDataJSON()??{},restaurant=Number(request.headers()['x-restaurant-id'])||1;
  const send=(json:unknown,status=200)=>route.fulfill({json,status});const fail=()=>send({error:'Échec synthétique clients'},503);
  const consume=(key:keyof typeof faults)=>{if(faults[key]>0){faults[key]--;return true;}return false;};
  const handled=path==='/api/v1/analytics/customers'||/^\/api\/v1\/restaurants\/\d+\/customers\//.test(path);
  if(handled){
   if(method==='GET')reads.push({path,restaurant,query:url.search});else{writes.push({path,restaurant,method,body,query:url.search});if(faults.writeDelay)await new Promise(resolve=>setTimeout(resolve,faults.writeDelay));}
   if(path==='/api/v1/analytics/customers'){
    const search=url.searchParams.get('search')??'';const snapshot=structuredClone(customers.filter(customer=>`${customer.customer_name} ${customer.customer_phone}`.toLowerCase().includes(search.toLowerCase())));
    if(search==='Client'&&faults.searchDelay)await new Promise(resolve=>setTimeout(resolve,faults.searchDelay));if(consume('list'))return fail();return send({customers:snapshot,total:search?snapshot.length:total,page:Number(url.searchParams.get('page')),per_page:25,total_active:0,total_at_risk:0,total_churned:0});
   }
   if(path.endsWith('/trusted')){
    if(method==='GET'){if(consume('trustedGet'))return fail();return send({trusted_customers:trusted});}
    if(consume('trustedPost'))return fail();const customer={id:100+writes.length,restaurant_id:restaurant,...body};trusted.push(customer);faults.list+=faults.refreshAfterCreate;faults.refreshAfterCreate=0;return send({trusted_customer:customer});
   }
   if(path.includes('/trusted/')){if(consume('trustedDelete'))return fail();const index=trusted.findIndex(customer=>customer.id===Number(path.split('/').at(-1)));if(index<0)return send({error:'Already deleted'},404);trusted.splice(index,1);return route.fulfill({status:204});}
   if(path.endsWith('/profile')){
    const phone=url.searchParams.get('phone')!;if(method==='GET'){if(faults.profileDelay)await new Promise(resolve=>setTimeout(resolve,faults.profileDelay));if(consume('profile'))return fail();return send({profile:profiles.get(phone)??{has_account:false,phone,name:'',address:'',city:'',floor:'',apt:'',entry_code:'',delivery_notes:''}});}
    if(consume('profileSave'))return fail();const profile={...profiles.get(phone)!,...body};profiles.set(phone,profile);return send({profile});
   }
   if(path.endsWith('/duplicates/dismiss')){dismisses++;if(dismisses===faults.dismissNth)return fail();if(dismisses>=(faults.dismissNth?4:3))groups=[];return route.fulfill({status:204});}
   if(path.endsWith('/duplicates')){if(consume('duplicates'))return fail();return send({groups});}
   if(path.endsWith('/merge')){if(consume('merge'))return fail();groups=[];faults.list+=faults.refreshAfterMerge;faults.refreshAfterMerge=0;return route.fulfill({status:204});}
   if(path.includes('/merge/')){if(consume('detach'))return fail();const phone=decodeURIComponent(path.split('/').at(-1)!);customers[0].phones=customers[0].phones.filter(value=>value!==phone);faults.list+=faults.refreshAfterDetach;faults.refreshAfterDetach=0;return route.fulfill({status:204});}
  }
  const result=fixture.response(request.url(),method,body,restaurant);return send(result.json??{},result.status??200);
 });
 await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 return {customers,trusted,profiles,writes,reads,faults,fixture,setTotal:(value:number)=>{total=value;}};
}
const editor=(page:Page)=>page.getByRole('dialog',{name:'Modifier le client',exact:true});
async function openFirst(page:Page){await page.goto('/1/customers');await page.getByRole('button',{name:`Modifier le client · ${names[0]}`,exact:true}).click();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toBeEnabled();}
const writesOf=(state:Awaited<ReturnType<typeof installCustomers>>,suffix:string,method?:string)=>state.writes.filter(write=>write.path.endsWith(suffix)&&(!method||write.method===method));

for(const locale of ['fr','he'])test(`customers list and keyboard profile ${locale}`,async({page},info)=>{
 await page.setViewportSize({width:locale==='fr'?375:1440,height:950});const state=await installCustomers(page,{locale,theme:locale==='he'?'dark':'light'});await page.goto('/1/customers');const trigger=page.getByRole('button',{name:`${locale==='fr'?'Modifier le client':'עריכת לקוח'} · ${names[0]}`,exact:true});await expect(trigger).toBeVisible();await page.screenshot({path:info.outputPath(`customers-list-${locale}.png`)});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog.getByRole('textbox').first()).toHaveValue(names[0]);for(let i=0;i<18;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBeTruthy();}await dialog.getByRole('textbox').first().focus();await dialog.locator('.overflow-y-auto').evaluate(element=>element.scrollTop=0);await page.screenshot({path:info.outputPath(`customers-profile-${locale}.png`)});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(state.writes).toHaveLength(0);expect(state.fixture.unhandled).toEqual([]);
});

test('customers list loading error never becomes an empty state and retries',async({page})=>{
 const state=await installCustomers(page);state.faults.list=100;await page.goto('/1/customers');await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(page.getByText('Aucun client pour le moment.',{exact:true})).toHaveCount(0);state.faults.list=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('button',{name:`Modifier le client · ${names[0]}`})).toBeVisible();
});

test('customers profile load error blocks saving until complete retry',async({page})=>{
 const state=await installCustomers(page);state.faults.profile=100;await page.goto('/1/customers');await page.getByRole('button',{name:`Modifier le client · ${names[0]}`}).click();await expect(editor(page).getByRole('alert')).toContainText('Échec synthétique');await expect(editor(page).getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();state.faults.profile=0;await editor(page).getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor(page).getByRole('textbox',{name:'Code immeuble',exact:true})).toHaveValue('AB12');expect(state.writes).toHaveLength(0);
});

test('customers guest address and cash notes resume after confirmed removal',async({page},info)=>{
 const state=await installCustomers(page);await openFirst(page);await editor(page).getByRole('textbox',{name:'Code immeuble',exact:true}).fill('NEW42');await editor(page).getByRole('textbox',{name:'Notes (optionnel)',exact:true}).fill('Note corrigée');state.faults.trustedPost=1;await editor(page).getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor(page).getByRole('alert')).toContainText('Échec synthétique');await expect(editor(page).getByText('Une partie des changements est enregistrée.',{exact:false})).toBeVisible();await expect(editor(page).getByRole('textbox',{name:'Code immeuble',exact:true})).toHaveValue('NEW42');await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toBeDisabled();await page.screenshot({path:info.outputPath('customers-partial-save.png')});await editor(page).getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor(page)).toHaveCount(0);expect(writesOf(state,'/profile','PUT')).toHaveLength(1);expect(writesOf(state,'/trusted/51','DELETE')).toHaveLength(1);expect(writesOf(state,'/trusted','POST')).toHaveLength(2);expect(state.profiles.get(phones[0])?.entry_code).toBe('NEW42');expect(state.trusted.find(customer=>customer.phone==='+972500000001')?.notes).toBe('Note corrigée');
});

test('customers failed profile save retains editable draft and local leave guard',async({page})=>{
 const state=await installCustomers(page);state.faults.profileSave=1;await openFirst(page);await editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true}).fill('Nom corrigé');await editor(page).getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor(page).getByRole('alert')).toBeVisible();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toHaveValue('Nom corrigé');await editor(page).getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor(page)).toHaveCount(0);expect(writesOf(state,'/profile','PUT')).toHaveLength(2);
});

test('customers creation retains its receipt when list refresh fails',async({page})=>{
 const state=await installCustomers(page);await page.goto('/2/customers');await page.getByRole('button',{name:'Ajouter un client',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Numéro de téléphone',exact:true}).fill('0500000010');await dialog.getByRole('textbox',{name:'Nom (optionnel)',exact:true}).fill('Nouveau démo');state.faults.refreshAfterCreate=1;await dialog.getByRole('button',{name:'Ajouter un client',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Le changement est enregistré');await expect(dialog.getByRole('textbox').first()).toBeDisabled();await dialog.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writesOf(state,'/trusted','POST')).toHaveLength(1);expect(state.writes[0].restaurant).toBe(2);expect(state.writes[0].path).toContain('/restaurants/2/');
});

test('customers blocks double submission and closing during writes',async({page})=>{
 const state=await installCustomers(page);state.faults.writeDelay=600;await page.goto('/1/customers');await page.getByRole('button',{name:'Ajouter un client',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Numéro de téléphone',exact:true}).fill('0500000010');const submit=dialog.getByRole('button',{name:'Ajouter un client',exact:true});await submit.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect(dialog.getByRole('button',{name:'Annuler',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog).toHaveCount(0);expect(writesOf(state,'/trusted','POST')).toHaveLength(1);
});

test('customers detaches an alias without losing the unsaved profile or repeating deletion',async({page})=>{
 const state=await installCustomers(page);await openFirst(page);await editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true}).fill('Nom encore en brouillon');await editor(page).getByRole('button',{name:'Détacher',exact:true}).click();const detach=page.getByRole('dialog',{name:'Détacher',exact:true});state.faults.refreshAfterDetach=1;await detach.getByRole('button',{name:'Détacher',exact:true}).click();await expect(detach.getByRole('alert')).toBeVisible();await detach.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(detach).toHaveCount(0);await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toHaveValue('Nom encore en brouillon');await expect(editor(page).getByRole('button',{name:'Détacher',exact:true})).toHaveCount(0);expect(writesOf(state,'/merge/0500000004','DELETE')).toHaveLength(1);expect(writesOf(state,'/profile','PUT')).toHaveLength(0);
});

test('customers merge keeps its chosen primary and does not repeat an acknowledged merge',async({page},info)=>{
 const state=await installCustomers(page);await page.goto('/1/customers');await page.getByRole('checkbox',{name:`Sélectionner ${names[0]}`,exact:true}).check();await page.getByRole('checkbox',{name:`Sélectionner ${names[1]}`,exact:true}).check();await page.getByRole('button',{name:'Fusionner (2)',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('radio').first()).toBeChecked();await dialog.getByRole('radio').nth(1).check();state.faults.refreshAfterMerge=1;await page.screenshot({path:info.outputPath('customers-merge.png')});await dialog.getByRole('button',{name:'Fusionner',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByRole('radio').nth(1)).toBeChecked();await expect(dialog.getByRole('radio').nth(1)).toBeDisabled();await dialog.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writesOf(state,'/merge','POST')).toHaveLength(1);expect(writesOf(state,'/merge','POST')[0].body).toEqual({primary_phone:phones[1],alias_phones:[phones[0]]});
});

test('customers duplicate dismissal resumes remaining pairs after a partial failure',async({page},info)=>{
 const state=await installCustomers(page);state.faults.dismissNth=2;await page.goto('/1/customers');await page.getByRole('button',{name:'1 doublons à vérifier',exact:true}).click();await page.screenshot({path:info.outputPath('customers-duplicates.png')});await page.getByRole('button',{name:'Ignorer',exact:true}).click();await expect(page.getByRole('region',{name:'Suggestions de doublons clients'}).getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Ignorer',exact:true}).click();await expect(page.getByRole('region',{name:'Suggestions de doublons clients'})).toHaveCount(0);const writes=writesOf(state,'/duplicates/dismiss');expect(writes.map(write=>write.body)).toEqual([{phone_a:phones[0],phone_b:phones[1]},{phone_a:phones[0],phone_b:phones[2]},{phone_a:phones[0],phone_b:phones[2]},{phone_a:phones[1],phone_b:phones[2]}]);
});

test('customers duplicate merge retains receipt even after the suggestion disappears',async({page})=>{
 const state=await installCustomers(page);state.faults.refreshAfterMerge=1;await page.goto('/1/customers');await page.getByRole('button',{name:'1 doublons à vérifier',exact:true}).click();await page.getByRole('button',{name:'Fusionner (3)',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Fusionner',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await dialog.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writesOf(state,'/merge','POST')).toHaveLength(1);
});

test('customers duplicate load error is visible and independent from the customer list',async({page})=>{
 const state=await installCustomers(page);state.faults.duplicates=100;await page.goto('/1/customers');const region=page.getByRole('region',{name:'Suggestions de doublons clients'});await expect(region.getByRole('alert')).toContainText('Échec synthétique');await expect(page.getByRole('button',{name:`Modifier le client · ${names[0]}`})).toBeVisible();state.faults.duplicates=0;await region.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(region.getByRole('button',{name:'1 doublons à vérifier',exact:true})).toBeVisible();
});

test('customers search ignores a stale result and clears prior selection',async({page})=>{
 const state=await installCustomers(page);state.faults.searchDelay=1500;await page.goto('/1/customers');await page.getByRole('checkbox',{name:`Sélectionner ${names[0]}`,exact:true}).check();await page.getByRole('checkbox',{name:`Sélectionner ${names[1]}`,exact:true}).check();const search=page.getByRole('textbox',{name:'Rechercher des clients…',exact:true});await search.fill('Client');await expect.poll(()=>state.reads.filter(read=>read.query.includes('search=Client')).length).toBeGreaterThan(0);await search.fill('Gamma');await expect(page.getByRole('button',{name:`Modifier le client · ${names[2]}`})).toBeVisible();await expect(page.getByRole('button',{name:'Fusionner (2)',exact:true})).toHaveCount(0);await expect.poll(()=>state.reads.filter(read=>read.query.includes('search=Gamma')).length).toBeGreaterThan(0);await page.waitForTimeout(1600);await expect(page.getByRole('button',{name:`Modifier le client · ${names[2]}`})).toBeVisible();await expect(page.getByRole('button',{name:`Modifier le client · ${names[0]}`})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});

test('customers keeps paginated query contract and clears selection on next page',async({page})=>{
 const state=await installCustomers(page);state.setTotal(55);await page.goto('/1/customers');await page.getByRole('checkbox',{name:`Sélectionner ${names[0]}`,exact:true}).check();await page.getByRole('checkbox',{name:`Sélectionner ${names[1]}`,exact:true}).check();await page.getByRole('button',{name:'Suivant',exact:true}).click();await expect(page.getByRole('navigation',{name:'Pages des clients'})).toContainText('2 / 3');await expect(page.getByRole('button',{name:'Fusionner (2)',exact:true})).toHaveCount(0);const last=state.reads.filter(read=>read.path==='/api/v1/analytics/customers').at(-1)!;const params=new URLSearchParams(last.query);expect(Object.fromEntries(params)).toMatchObject({restaurant_id:'1',page:'2',per_page:'25',sort_by:'total_spent',sort_dir:'desc'});await expect(page.getByText('Client ajouté sans commande',{exact:true})).toHaveCount(0);
});

test('customers read-only access retains the list without mutation controls',async({page})=>{
 const state=await installCustomers(page,{readOnly:true});await page.goto('/1/customers');await expect(page.getByText(names[0],{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ajouter un client',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Modifier le client/})).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('region',{name:'Suggestions de doublons clients'})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});

test('customers true empty list differs from unavailable data',async({page})=>{
 const state=await installCustomers(page,{empty:true});await page.goto('/1/customers');await expect(page.getByText('Aucun client pour le moment.',{exact:true})).toBeVisible();await expect(page.locator('main [role=alert]')).toHaveCount(0);expect(state.writes).toHaveLength(0);
});

test('customers cash removal retry does not repeat the confirmed profile update',async({page})=>{
 const state=await installCustomers(page);await openFirst(page);await editor(page).getByRole('checkbox',{name:'Autoriser le paiement en espèces',exact:true}).uncheck();state.faults.trustedDelete=1;await editor(page).getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor(page).getByRole('alert')).toBeVisible();await editor(page).getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor(page)).toHaveCount(0);expect(writesOf(state,'/profile','PUT')).toHaveLength(1);expect(writesOf(state,'/trusted/51','DELETE')).toHaveLength(2);expect(writesOf(state,'/trusted','POST')).toHaveLength(0);expect(state.trusted.some(customer=>customer.id===51)).toBe(false);
});

test('customers failed cash-list load never presents an editable unauthorised replacement',async({page})=>{
 const state=await installCustomers(page);state.faults.trustedGet=100;await page.goto('/1/customers');await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(page.getByRole('button',{name:/Modifier le client/})).toHaveCount(0);state.faults.trustedGet=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('button',{name:`Modifier le client · ${names[0]}`})).toBeVisible();expect(state.writes).toHaveLength(0);
});

test('customers closing a loading profile cannot populate the next profile with its response',async({page})=>{
 const state=await installCustomers(page);state.faults.profileDelay=700;await page.goto('/1/customers');await page.getByRole('button',{name:`Modifier le client · ${names[0]}`} ).click();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await page.getByRole('button',{name:`Modifier le client · ${names[1]}`} ).click();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toBeEnabled();await expect(editor(page).getByRole('textbox',{name:'Nom (optionnel)',exact:true})).toHaveValue(names[1]);await expect(editor(page).getByRole('checkbox',{name:'Autoriser le paiement en espèces',exact:true})).not.toBeChecked();expect(state.writes).toHaveLength(0);
});
