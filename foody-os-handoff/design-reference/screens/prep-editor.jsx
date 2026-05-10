// Modifier la préparation — FULL-SCREEN EDITOR
// Same pattern as Item Editor and Stock Editor.

function PrepEditor({ theme = 'dark' }) {
  const ingredients = [
    { n:'Tomates concassées', q:'2.5',  u:'kg',   pu:'4.80 ₪/kg',  cost:12.00, sub:'Fruits' },
    { n:'Oignons',            q:'400',  u:'g',    pu:'3.20 ₪/kg',  cost:1.28,  sub:'Légumes' },
    { n:'Ail Épluché',        q:'30',   u:'g',    pu:'30.00 ₪/kg', cost:0.90,  sub:'Légumes' },
    { n:'Huile d\'olive',     q:'80',   u:'ml',   pu:'45.00 ₪/L',  cost:3.60,  sub:'Huiles' },
    { n:'Basilic frais',      q:'25',   u:'g',    pu:'45.00 ₪/kg', cost:1.13,  sub:'Légumes' },
    { n:'Sel',                q:'15',   u:'g',    pu:'2.50 ₪/kg',  cost:0.04,  sub:'Épicerie' },
    { n:'Sucre',              q:'20',   u:'g',    pu:'4.20 ₪/kg',  cost:0.08,  sub:'Épicerie' },
  ];
  const total = ingredients.reduce((s, r) => s + r.cost, 0);
  const yield_qty = 3.5, yield_unit = 'L';
  const perUnit = total / yield_qty;

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', position:'relative', background:'var(--bg)', color:'var(--fg)', overflow:'hidden'}}>
      {/* Dimmed chrome behind */}
      <div style={{filter:'blur(2px)', opacity:.5, pointerEvents:'none', height:'100%'}}>
        <div className="app">
          <Sidebar active="kitchen.prep" theme={theme}/>
          <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
            <Topbar crumbs={['Cuisine','Préparations']}/>
            <main className="main"/>
          </div>
        </div>
      </div>

      <FullScreenEditor
        title="Modifier la préparation"
        subtitle="Dernière modification par Omer · hier"
        status={<span className="badge badge-neutral" style={{marginRight:8}}><Icon name="check" size={12}/> Enregistré</span>}
        onClose={() => {}}
        onSave={() => {}}
        rail={<PrepRail total={total} perUnit={perUnit} yield_qty={yield_qty} yield_unit={yield_unit}/>}
      >
        <PrepMain ingredients={ingredients} total={total} yield_qty={yield_qty} yield_unit={yield_unit}/>
      </FullScreenEditor>
    </div>
  );
}

function PrepRail({ total, perUnit, yield_qty, yield_unit }) {
  return (
    <>
      {/* Icon tile instead of photo */}
      <div style={{
        width:'100%', aspectRatio:'1', borderRadius:'var(--r-lg)',
        background:'linear-gradient(135deg, #c2410c, #7c2d12)',
        display:'grid', placeItems:'center', color:'#fff',
      }}>
        <Icon name="layers" size={80}/>
      </div>

      <div style={{marginTop:'var(--s-4)'}}>
        <div style={{fontSize:'var(--fs-xl)', fontWeight:600, letterSpacing:'-0.01em'}}>Sauce tomate maison</div>
        <div className="hstack" style={{marginTop:6}}>
          <span className="badge badge-neutral">SAUCES</span>
          <span className="badge badge-success"><span className="badge-dot"/>Frais</span>
        </div>
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      {/* Cost summary — key metric */}
      <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Coût de revient</div>
      <div style={{fontSize:'var(--fs-2xl)', fontWeight:600, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', fontFamily:'var(--font-serif)'}}>
        ₪{perUnit.toFixed(2)}
        <span style={{fontSize:'var(--fs-sm)', color:'var(--fg-muted)', fontWeight:400, fontFamily:'inherit'}}> / {yield_unit}</span>
      </div>
      <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:2}}>
        Rendement {yield_qty} {yield_unit} · total ₪{total.toFixed(2)}
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Utilisation (7j)</div>
      <div className="kpi-value" style={{fontSize:'var(--fs-2xl)'}}>9</div>
      <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>plats · 2.1 L consommés</div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Utilisé dans</div>
      <div className="vstack" style={{gap:6, fontSize:'var(--fs-sm)'}}>
        {['MARGHERITA CLASSIQUE', 'PENNE ARRABIATA', 'PARMIGIANA', 'BRUSCHETTA TOMATE'].map(n => (
          <div key={n} className="hstack" style={{justifyContent:'space-between', padding:'6px 10px', background:'var(--surface-2)', borderRadius:'var(--r-sm)'}}>
            <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{n}</span>
            <Icon name="chevronRight" size={12}/>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start', color:'var(--fg-muted)'}}>
          + 5 autres plats
        </button>
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div className="vstack" style={{gap:'var(--s-2)'}}>
        <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start'}}><Icon name="layers" size={14}/> Dupliquer</button>
        <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start', color:'var(--danger-500)'}}><Icon name="trash" size={14}/> Archiver</button>
      </div>
    </>
  );
}

function PrepMain({ ingredients, total, yield_qty, yield_unit }) {
  return (
    <div style={{maxWidth:860}}>
      {/* Header row — name + yield + category */}
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Identité & rendement
      </div>

      <Section title="Informations de base">
        <div className="hstack" style={{gap:'var(--s-3)'}}>
          <Field label="Nom de la préparation" grow>
            <input className="input" defaultValue="Sauce tomate maison"/>
          </Field>
          <Field label="Catégorie">
            <select className="input" style={{width:160}}>
              <option>Sauces</option><option>Bases</option><option>Mises</option>
            </select>
          </Field>
          <Field label="Rendement">
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <input className="input num" defaultValue={yield_qty} style={{width:80, textAlign:'right'}}/>
              <select className="input" style={{width:80}}>
                <option>L</option><option>kg</option><option>unité</option>
              </select>
            </div>
          </Field>
        </div>
      </Section>

      {/* Ingredients — full width */}
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, margin:'var(--s-6) 0 var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Recette
      </div>

      <Section
        title="Ingrédients"
        desc={`${ingredients.length} ingrédients · coût recalculé en direct depuis le stock`}
        aside={
          <div className="hstack" style={{gap:'var(--s-3)'}}>
            <span className="num subtle" style={{fontSize:'var(--fs-xs)'}}>Total : <b style={{color:'var(--fg)'}}>₪{total.toFixed(2)}</b></span>
            <button className="btn btn-secondary btn-sm"><Icon name="plus" size={12}/> Ajouter</button>
          </div>
        }
      >
        <div style={{border:'1px solid var(--line)', borderRadius:'var(--r-md)', overflow:'hidden'}}>
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 140px 140px 100px 32px',
            gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)',
            background:'var(--surface-2)',
            fontSize:'var(--fs-xs)', fontWeight:600, letterSpacing:'.04em',
            textTransform:'uppercase', color:'var(--fg-muted)',
          }}>
            <span>Ingrédient</span>
            <span style={{textAlign:'right'}}>Quantité</span>
            <span style={{textAlign:'right'}}>Prix unitaire</span>
            <span style={{textAlign:'right'}}>Coût</span>
            <span/>
          </div>
          {ingredients.map((r, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'1fr 140px 140px 100px 32px',
              gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)',
              alignItems:'center', fontSize:'var(--fs-sm)',
              borderTop:'1px solid var(--line)',
            }}>
              <div className="hstack" style={{gap:'var(--s-3)'}}>
                <div style={{width:28, height:28, borderRadius:6, background:'var(--surface-3)', flexShrink:0}}/>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:500}}>{r.n}</div>
                  <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{r.sub}</div>
                </div>
              </div>
              <div className="hstack" style={{gap:4, justifyContent:'flex-end'}}>
                <input className="input num" defaultValue={r.q} style={{width:70, textAlign:'right', height:30, padding:'0 8px'}}/>
                <span className="subtle mono" style={{fontSize:'var(--fs-xs)', minWidth:22}}>{r.u}</span>
              </div>
              <span className="num subtle" style={{textAlign:'right', fontSize:'var(--fs-xs)'}}>{r.pu}</span>
              <span className="num" style={{textAlign:'right', fontWeight:500}}>₪{r.cost.toFixed(2)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" style={{width:28, height:28}}><Icon name="trash" size={12}/></button>
            </div>
          ))}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 140px 140px 100px 32px',
            gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)',
            borderTop:'1px solid var(--line)', background:'var(--surface-2)',
          }}>
            <div className="input-group" style={{height:32}}>
              <Icon name="plus" size={12}/>
              <input placeholder="Ajouter un ingrédient ou une préparation…" style={{fontSize:'var(--fs-sm)'}}/>
            </div>
            <div/><div/><div/><div/>
          </div>
        </div>
      </Section>

      <Section title="Instructions" desc="Étapes de préparation pour votre équipe.">
        <div className="vstack" style={{gap:'var(--s-3)'}}>
          {[
            { t:'Mise en place', m:5, body:'Émincer finement les oignons et l\'ail. Ciseler le basilic juste avant utilisation.'},
            { t:'Suer les aromates', m:5, body:'Faire revenir oignons et ail dans l\'huile d\'olive 5 min à feu doux sans coloration.'},
            { t:'Cuisson', m:40, body:'Ajouter les tomates concassées, le sel, le sucre. Porter à frémissement, laisser mijoter 40 min en remuant.'},
            { t:'Finition', m:2, body:'Incorporer le basilic ciselé en fin de cuisson. Rectifier l\'assaisonnement.'},
          ].map((s, i) => (
            <div key={i} className="card" style={{padding:'var(--s-4)', display:'flex', gap:'var(--s-4)'}}>
              <div style={{width:32, height:32, borderRadius:'50%', background:'var(--brand-500)', color:'#fff', display:'grid', placeItems:'center', fontWeight:700, flexShrink:0}}>{i + 1}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:500, marginBottom:4}}>{s.t}</div>
                <div className="muted" style={{fontSize:'var(--fs-sm)', lineHeight:1.55}}>{s.body}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="hstack" style={{justifyContent:'flex-end'}}><span className="num">{s.m}</span><span className="muted">min</span></div>
                <button className="btn btn-ghost btn-icon btn-sm" style={{marginTop:4, color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{alignSelf:'flex-start', color:'var(--brand-500)'}}>
            <Icon name="plus" size={14}/> Ajouter une étape
          </button>
        </div>
      </Section>

      {/* Conservation — full width */}
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, margin:'var(--s-6) 0 var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Conservation & coût
      </div>

      <Section title="Conservation" desc="Rappel affiché sur l'étiquette imprimée de la préparation.">
        <div className="hstack" style={{gap:'var(--s-3)'}}>
          <Field label="DLC après préparation" grow>
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <input className="input num" defaultValue="4" style={{width:80, textAlign:'right'}}/>
              <select className="input" style={{flex:1}}>
                <option>jours</option><option>heures</option>
              </select>
            </div>
          </Field>
          <Field label="Température de stockage" grow>
            <select className="input"><option>Froid positif (2–4°C)</option><option>Froid négatif (&lt;-18°C)</option><option>Ambiant</option></select>
          </Field>
          <Field label="Perte estimée" grow>
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <input className="input num" defaultValue="3" style={{width:70, textAlign:'right'}}/>
              <span className="subtle" style={{fontSize:'var(--fs-sm)'}}>%</span>
            </div>
          </Field>
        </div>
        <div style={{marginTop:'var(--s-4)'}}>
          <Field label="Allergènes">
            <div className="hstack" style={{gap:4, flexWrap:'wrap'}}>
              {['Gluten','Lait','Œuf','Fruits à coque','Soja','Céleri','Moutarde'].map(a => (
                <span key={a} className="chip" style={{fontSize:'var(--fs-xs)'}}>{a}</span>
              ))}
              <button className="chip" style={{fontSize:'var(--fs-xs)', borderStyle:'dashed'}}>
                <Icon name="plus" size={10}/> Ajouter
              </button>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Décomposition du coût" desc="Basé sur les ingrédients + perte estimée.">
        <div className="vstack" style={{gap:'var(--s-2)', fontSize:'var(--fs-sm)'}}>
          <div className="hstack" style={{justifyContent:'space-between'}}>
            <span className="subtle">Matière première</span>
            <span className="num">₪{total.toFixed(2)}</span>
          </div>
          <div className="hstack" style={{justifyContent:'space-between'}}>
            <span className="subtle">Perte (3%)</span>
            <span className="num">₪{(total * 0.03).toFixed(2)}</span>
          </div>
          <div style={{height:1, background:'var(--line)', margin:'var(--s-2) 0'}}/>
          <div className="hstack" style={{justifyContent:'space-between', fontSize:'var(--fs-md)', fontWeight:600}}>
            <span>Coût total</span>
            <span className="num">₪{(total * 1.03).toFixed(2)}</span>
          </div>
          <div className="hstack" style={{justifyContent:'space-between'}}>
            <span className="subtle">Coût à l'unité ({yield_unit})</span>
            <span className="num" style={{color:'var(--brand-500)', fontWeight:600}}>₪{((total * 1.03) / yield_qty).toFixed(2)}</span>
          </div>
        </div>
      </Section>
    </div>
  );
}

Object.assign(window, { PrepEditor });
