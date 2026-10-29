import {test,expect} from "@playwright/test";
import type {DraftStatePayload} from "../../src/lib/website-v3/types";

// Real renderers; writes stay in the synthetic local API.
test("Pink Coffee survives slide edits, reload and publication",async ({page,context,request},testInfo)=>{
  test.setTimeout(300_000);
  await page.addInitScript(()=>{
    localStorage.setItem("foody_restaurant_token","isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user",JSON.stringify({id:1,full_name:"Demo",role:"manager",email:"demo@foody.test"}));
    localStorage.setItem("foody_restaurant_ids","[1]");localStorage.setItem("foody-admin-locale","fr");
  });
  await context.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const draft=async ():Promise<DraftStatePayload>=>(await(await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed=await draft();seed.pages=seed.pages.slice(0,2);seed.pages[1].slug="commander";
  seed.sections=[{id:8100,section_type:"hero_banner",page:"home",page_id:1,sort_order:0,is_visible:true,layout:"centered",content:{headline:"Notre café",image_url:"http://localhost:3000/assets/placeholder-item-lg.svg",cta_text:"Commander",cta_link:"/order"},settings:{}}];
  expect((await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",{data:seed})).ok()).toBe(true);
  expect((await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish")).ok()).toBe(true);
  await page.goto("/1/website-v3");
  await page.getByRole("button",{name:"Design du site",exact:true}).click();
  await page.getByRole("button",{name:"Thèmes du site",exact:true}).click();
  await page.locator("article.sqe-theme-card").filter({hasText:"Pink Coffee"}).getByRole("button",{name:"Aperçu",exact:true}).click();
  await page.getByRole("button",{name:"Appliquer le thème",exact:true}).click();
  await expect.poll(async()=>(await draft()).sections.find(s=>s.id===8100)?.layout).toBe("campaign");
  const preview=page.frameLocator('iframe[title="Aperçu de Accueil"]');
  await expect(preview.locator(".website-campaign")).toBeVisible({timeout:120_000});
  await page.getByRole("button",{name:"Terminé",exact:true}).click();
  await page.getByRole("button",{name:"Bannière principale",exact:true}).click();
  await page.getByRole("button",{name:"Cliquez ici pour modifier",exact:true}).click();
  const panel=page.locator(".sqe-inspector");
  const slideDetails=panel.locator("fieldset").first().locator(":scope > details");
  await slideDetails.first().locator(":scope > summary").click();
  await panel.locator('[data-field-id="section.content.slides.0.headline"]').fill("Just more coffee");
  await panel.locator('[data-field-id="section.content.slides.0.cta_text"]').fill("Choisir ma boisson");
  await panel.locator('[data-field-id="section.settings.slide_duration_seconds"]').fill("12");
  await panel.locator('[data-field-id="section.settings.image_fit"]').selectOption("contain");
  await panel.getByRole("button",{name:"Ajouter une diapositive",exact:true}).click();
  const slides=async()=>(await draft()).sections.find(s=>s.id===8100)?.content.slides as Array<{headline:string}>;
  await expect.poll(async()=>(await slides()).length).toBe(4);
  await slideDetails.last().locator(":scope > summary").click();
  await panel.getByRole("button",{name:"Supprimer la diapositive 4",exact:true}).click();
  await panel.getByRole("button",{name:"Descendre 1",exact:true}).click();
  await expect.poll(async()=>(await slides())[1].headline).toBe("Just more coffee");
  await panel.getByRole("button",{name:"Monter 2",exact:true}).click();
  await expect.poll(async()=>(await slides())[0].headline).toBe("Just more coffee");
  await page.reload();
  await expect(preview.getByRole("heading",{name:"Just more coffee",exact:true}).first()).toBeVisible({timeout:120_000});
  await page.getByRole("button",{name:"Format de l’aperçu",exact:true}).click();
  await page.getByRole("menuitemradio",{name:"Vue téléphone",exact:true}).click();
  await expect(preview.getByRole("heading",{name:"Just more coffee",exact:true}).first()).toHaveCSS("font-size","44px");
  await page.getByRole("button",{name:"Format de l’aperçu",exact:true}).click();
  await page.getByRole("menuitemradio",{name:"Vue ordinateur",exact:true}).click();
  await expect(page.getByRole("button",{name:"Publier",exact:true})).not.toHaveAttribute("title",/Vérifiez/);
  const published=page.waitForResponse(response=>response.url().endsWith("/website-publish")&&response.request().method()==="POST");
  await page.getByRole("button",{name:"Publier",exact:true}).click();expect((await published).ok()).toBe(true);
  const saved=await draft();expect(saved.pages).toHaveLength(2);expect(saved.pages[1].settings).toEqual(seed.pages[1].settings);
  expect(saved.sections.find(s=>s.section_type==="menu_highlights")?.settings).toMatchObject({card_presentation:"campaign",columns:4,mobile_columns:2});
  const storefront=await context.newPage();await storefront.goto("http://localhost:3000/r/atelier-foody?lang=fr");
  for(const width of [1440,375]){
    await storefront.setViewportSize({width,height:1000});
    await expect(storefront.getByRole("heading",{name:"Just more coffee",exact:true}).first()).toBeVisible();
    await expect(storefront.locator('.website-featured[data-presentation="campaign"]')).toBeVisible();
    expect(await storefront.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await storefront.screenshot({path:testInfo.outputPath(`pink-coffee-${width}.png`),fullPage:true});
  }
});
