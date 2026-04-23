// Item Editor — "Modifier l'article" — drawer/modal pattern
function ItemEditor({ theme = 'dark', tab = 'cost' }) {
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)'}}>
      {/* Dimmed app behind */}
      <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.5)'}}/>
      {/* Modal */}
      <div style={{position:'absolute', inset:'32px 24px 24px 24px', background:'var(--bg)', borderRadius:'var(--r-xl)', border:'1px solid var(--line)', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-3)'}}>
        {/* Modal head */}
        <div style={{height:60, padding:'0 var(--s-5)', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:'var(--s-4)', background:'var(--surface)'}}>
          <button className="btn btn-ghost btn-icon"><Icon name="x"/></button>
          <div style={{flex:1, textAlign:'center'}}>
            <div style={{fontSize:'var(--fs-md)', fontWeight:600}}>Modifier l'article</div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Dernière modification par Avi · il y a 12 min</div>
          </div>
          <div className="hstack">
            <span className="badge badge-neutral"><Icon name="check" size={12}/> Enregistré</span>
            <button className="btn btn-secondary btn-sm">Annuler</button>
            <button className="btn btn-primary btn-sm"><Icon name="save" size={14}/> Enregistrer</button>
          </div>
        </div>

        <div style={{flex:1, display:'grid', gridTemplateColumns:'280px 1fr', overflow:'hidden'}}>
          {/* Left rail */}
          <div style={{borderRight:'1px solid var(--line)', background:'var(--surface)', padding:'var(--s-5)', overflowY:'auto'}}>
            <div style={{position:'relative'}}>
              <div style={{width:'100%', aspectRatio:'1', borderRadius:'var(--r-lg)', background:'linear-gradient(135deg, #8B4513, #D2691E)', backgroundImage:'repeating-linear-gradient(45deg, rgba(0,0,0,.1) 0 6px, transparent 6px 12px)'}}/>
              <button style={{position:'absolute', bottom:8, right:8, width:32, height:32, borderRadius:8, background:'rgba(0,0,0,.6)', border:'none', color:'#fff', display:'grid', placeItems:'center'}}>
                <Icon name="edit" size={14}/>
              </button>
              <span className="badge badge-success" style={{position:'absolute', top:8, left:8}}><span className="badge-dot"/>Actif</span>
            </div>
            <div style={{marginTop:'var(--s-4)'}}>
              <div style={{fontSize:'var(--fs-xl)', fontWeight:600, letterSpacing:'-0.01em'}}>L'OR ROUGE</div>
              <div className="hstack" style={{marginTop:6}}>
                <span className="num" style={{color:'var(--brand-500)', fontWeight:600}}>₪35.00</span>
                <span className="badge badge-neutral">SALADES</span>
              </div>
            </div>

            <div className="divider" style={{margin:'var(--s-4) 0'}}/>

            <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Résumé des coûts</div>
            <div className="vstack" style={{gap:'var(--s-2)'}}>
              <div className="hstack" style={{justifyContent:'space-between'}}>
                <span className="muted" style={{fontSize:'var(--fs-sm)'}}>Coût alimentaire</span>
                <span className="num" style={{fontSize:'var(--fs-sm)'}}>₪12.57</span>
              </div>
              <div className="hstack" style={{justifyContent:'space-between'}}>
                <span className="muted" style={{fontSize:'var(--fs-sm)'}}>Marge brute</span>
                <span className="num" style={{fontSize:'var(--fs-sm)', color:'var(--success-500)'}}>₪17.09</span>
              </div>
              <div className="hstack" style={{justifyContent:'space-between'}}>
                <span className="muted" style={{fontSize:'var(--fs-sm)'}}>% Coût</span>
                <span className="num badge badge-warning" style={{fontSize:'var(--fs-sm)'}}><Icon name="warn" size={12}/>42.4%</span>
              </div>
            </div>

            <div className="divider" style={{margin:'var(--s-4) 0'}}/>

            <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Ventes (7j)</div>
            <div className="kpi-value" style={{fontSize:'var(--fs-2xl)'}}>47</div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>₪1,645 de revenu</div>

            <div className="divider" style={{margin:'var(--s-4) 0'}}/>

            <div className="vstack" style={{gap:'var(--s-2)'}}>
              <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start'}}><Icon name="eye" size={14}/> Aperçu sur le site</button>
              <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start'}}><Icon name="layers" size={14}/> Dupliquer</button>
              <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start', color:'var(--danger-500)'}}><Icon name="trash" size={14}/> Archiver</button>
            </div>
          </div>

          {/* Right content */}
          <div style={{overflowY:'auto', padding:'var(--s-6) var(--s-8)'}}>
            {/* Tabs */}
            <div className="tabs" style={{marginBottom:'var(--s-5)'}}>
              <button className="tab" aria-selected={tab==='details'}><Icon name="box" size={14}/> Détails</button>
              <button className="tab" aria-selected={tab==='mods'}><Icon name="layers" size={14}/> Modificateurs</button>
              <button className="tab" aria-selected={tab==='recipe'}><Icon name="chef" size={14}/> Recette</button>
              <button className="tab" aria-selected={tab==='cost'}><Icon name="dollar" size={14}/> Coût <span className="badge badge-warning" style={{height:18, padding:'0 6px', marginLeft:4}}><Icon name="warn" size={10}/></span></button>
            </div>

            {tab === 'cost' && <CostTab/>}
            {tab === 'recipe' && <RecipeTab/>}
            {tab === 'details' && <DetailsTab/>}
            {tab === 'mods' && <ModsTab/>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CostTab() {
  return (
    <>
      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-4)'}}>
        <div>
          <div style={{fontSize:'var(--fs-xl)', fontWeight:600, display:'flex', alignItems:'center', gap:8}}>
            <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Coût
          </div>
        </div>
        <div className="tabs" style={{padding:2}}>
          <button className="tab" aria-selected="true">HT</button>
          <button className="tab" aria-selected="false">TTC</button>
        </div>
      </div>

      <div style={{marginBottom:'var(--s-4)'}}>
        <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Portion active</div>
        <div className="hstack">
          <button className="chip">Base</button>
          <button className="chip" aria-pressed="true">Normal <span style={{opacity:.8, marginLeft:4}}>250 g</span></button>
          <button className="chip">Grand <span style={{opacity:.6, marginLeft:4}}>500 g</span></button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
        <div className="kpi">
          <div className="kpi-label">Coût alimentaire</div>
          <div className="kpi-value">₪12.57</div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Par portion</div>
        </div>
        <div className="kpi" style={{background:'color-mix(in oklab, var(--success-500) 8%, var(--surface))', borderColor:'color-mix(in oklab, var(--success-500) 30%, var(--line))'}}>
          <div className="kpi-label">Marge brute</div>
          <div className="kpi-value" style={{color:'var(--success-500)'}}>₪17.09</div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>57.6% · sain</div>
        </div>
        <div className="kpi" style={{background:'color-mix(in oklab, var(--warning-500) 8%, var(--surface))', borderColor:'color-mix(in oklab, var(--warning-500) 30%, var(--line))'}}>
          <div className="kpi-label">% Coût</div>
          <div className="kpi-value" style={{color:'var(--warning-500)'}}>42.4%</div>
          <div style={{fontSize:'var(--fs-xs)', color:'var(--warning-500)'}}><Icon name="warn" size={12}/> Au-dessus de la cible (35%)</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Détail des coûts par ingrédient</div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>2 éléments</div>
          </div>
          <button className="btn btn-ghost btn-sm">Optimiser avec l'IA <Icon name="sparkles" size={12}/></button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th style={{textAlign:'right'}}>Quantité</th>
              <th style={{textAlign:'right'}}>Coût unitaire</th>
              <th style={{textAlign:'right'}}>Coût total</th>
              <th style={{width:100}}>%</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="hstack">
                  <div style={{width:24, height:24, borderRadius:6, background:'var(--cat-5)', display:'grid', placeItems:'center', color:'#fff', fontSize:10, fontWeight:700}}>A</div>
                  <div>
                    <div style={{fontSize:'var(--fs-sm)'}}>PRÉPARATION OR ROUGE</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Préparation · 4 ingrédients</div>
                  </div>
                </div>
              </td>
              <td style={{textAlign:'right'}} className="num">250 g</td>
              <td style={{textAlign:'right'}} className="num">₪46.27<span className="subtle" style={{fontSize:'var(--fs-xs)'}}> /kg</span></td>
              <td style={{textAlign:'right'}} className="num" style={{fontWeight:600}}>₪11.57</td>
              <td>
                <div className="hstack">
                  <div style={{width:60, height:4, background:'var(--surface-2)', borderRadius:2, overflow:'hidden'}}>
                    <div style={{width:'92%', height:'100%', background:'var(--brand-500)'}}/>
                  </div>
                  <span className="num" style={{fontSize:'var(--fs-xs)'}}>92%</span>
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <div className="hstack">
                  <div style={{width:24, height:24, borderRadius:6, background:'var(--cat-4)', display:'grid', placeItems:'center', color:'#fff', fontSize:10, fontWeight:700}}>B</div>
                  <div style={{fontSize:'var(--fs-sm)'}}>Boîte plastique 250g</div>
                </div>
              </td>
              <td style={{textAlign:'right'}} className="num">1 unit</td>
              <td style={{textAlign:'right'}} className="num">₪1.00</td>
              <td style={{textAlign:'right'}} className="num" style={{fontWeight:600}}>₪1.00</td>
              <td>
                <div className="hstack">
                  <div style={{width:60, height:4, background:'var(--surface-2)', borderRadius:2, overflow:'hidden'}}>
                    <div style={{width:'8%', height:'100%', background:'var(--fg-subtle)'}}/>
                  </div>
                  <span className="num" style={{fontSize:'var(--fs-xs)'}}>8%</span>
                </div>
              </td>
            </tr>
            <tr style={{background:'var(--surface-2)', fontWeight:600}}>
              <td>Total</td>
              <td/>
              <td/>
              <td style={{textAlign:'right'}} className="num">₪12.57</td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function RecipeTab() {
  return (
    <>
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Recette
      </div>
      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
        <div>
          <div style={{fontWeight:600}}>Ingrédients <span className="muted" style={{fontWeight:400}}>· 2 éléments</span></div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Liste des ingrédients nécessaires pour cette recette</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={14}/> Ajouter un ingrédient</button>
      </div>
      <div className="vstack" style={{gap:'var(--s-2)', marginBottom:'var(--s-5)'}}>
        <div className="card" style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
          <div style={{width:32, height:32, borderRadius:8, background:'var(--cat-5)', display:'grid', placeItems:'center', color:'#fff'}}>A</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:500}}>PRÉPARATION OR ROUGE <span className="badge badge-brand" style={{marginLeft:6}}>Préparation</span></div>
          </div>
          <div className="muted" style={{fontSize:'var(--fs-sm)'}}>— Adapté à la taille</div>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="chevronDown" size={14}/></button>
          <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
        </div>
        <div className="card" style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
          <div style={{width:32, height:32, borderRadius:8, background:'var(--cat-4)', display:'grid', placeItems:'center', color:'#fff'}}>B</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:500}}>Boîte plastique 250g <span className="badge badge-neutral" style={{marginLeft:6}}>Ingrédient brut</span></div>
          </div>
          <div className="num">1 unit · <span className="subtle">Quantité fixe</span></div>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="chevronDown" size={14}/></button>
          <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
        </div>
      </div>

      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
        <div>
          <div style={{fontWeight:600}}>Instructions <span className="muted" style={{fontWeight:400}}>· 4 étapes</span></div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Étapes détaillées pour préparer ce plat</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={14}/> Ajouter une étape</button>
      </div>
      <div className="vstack" style={{gap:'var(--s-3)'}}>
        {[
          { n:1, title:'Poivrons', time:5, body:'Laver les poivrons, retirer pédoncule, membranes blanches et graines. Couper en petits dés réguliers en conservant la peau.'},
          { n:2, title:'Cuisson', time:60, body:'Chauffer l\'huile de tournesol à feu fort dans une marmite large. Ajouter l\'ail haché, faire revenir jusqu\'à blanchiment sans coloration…'},
        ].map(s => (
          <div className="card" style={{padding:'var(--s-4)', display:'flex', gap:'var(--s-4)'}} key={s.n}>
            <div style={{width:32, height:32, borderRadius:'50%', background:'var(--brand-500)', color:'#fff', display:'grid', placeItems:'center', fontWeight:700, flexShrink:0}}>{s.n}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:500, marginBottom:4}}>{s.title}</div>
              <div className="muted" style={{fontSize:'var(--fs-sm)'}}>{s.body}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="hstack"><span className="num">{s.time}</span><span className="muted">min</span></div>
              <button className="btn btn-ghost btn-icon btn-sm" style={{marginTop:4, color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DetailsTab() {
  return (
    <>
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Détails
      </div>
      <div className="vstack" style={{gap:'var(--s-4)', maxWidth:720}}>
        <div>
          <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Type d'article</label>
          <select className="select"><option>Nourriture et boisson</option></select>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--s-4)'}}>
          <div>
            <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Nom de l'article</label>
            <input className="input" defaultValue="BETTERAVE"/>
          </div>
          <div>
            <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Catégorie</label>
            <select className="select"><option>SALADES</option></select>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'var(--s-4)'}}>
          <div>
            <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Prix de vente</label>
            <div className="input-group"><input defaultValue="25"/><span className="muted">₪</span></div>
          </div>
          <div>
            <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>TVA</label>
            <div className="input-group"><input defaultValue="18"/><span className="muted">%</span></div>
          </div>
          <div>
            <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Statut</label>
            <div className="hstack" style={{height:36}}><span className="dot-pulse"/> <span>Actif</span></div>
          </div>
        </div>
        <div>
          <label style={{fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:6, display:'block'}}>Description</label>
          <textarea className="textarea" defaultValue="olives kalamata"/>
        </div>
      </div>
    </>
  );
}

function ModsTab() {
  return (
    <>
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Modificateurs et variantes
      </div>
      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
        <div><div style={{fontWeight:600}}>Modificateurs</div><div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Options ajoutées à la commande</div></div>
        <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={14}/> Ajouter</button>
      </div>
      <div className="vstack" style={{gap:'var(--s-2)', marginBottom:'var(--s-5)'}}>
        <div className="card" style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center'}}>
          <div style={{flex:1}}>250gr <span className="muted" style={{fontSize:'var(--fs-xs)'}}>(add)</span></div>
          <button className="btn btn-ghost btn-sm" style={{color:'var(--danger-500)'}}>Supprimer</button>
        </div>
        <div className="card" style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center'}}>
          <div style={{flex:1}}>500gr <span className="muted" style={{fontSize:'var(--fs-xs)'}}>(add)</span></div>
          <span className="num">+₪15.00</span>
          <button className="btn btn-ghost btn-sm" style={{color:'var(--danger-500)', marginLeft:'var(--s-3)'}}>Supprimer</button>
        </div>
      </div>
      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
        <div><div style={{fontWeight:600}}>Variantes</div><div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Tailles ou options liées</div></div>
        <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={14}/> Ajouter</button>
      </div>
      <div className="card" style={{padding:'var(--s-4)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <div style={{fontWeight:500}}>Tailles Salade</div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>2 options · Normal, Grand</div>
        </div>
        <div className="hstack">
          <button className="btn btn-ghost btn-sm">Modifier</button>
          <button className="btn btn-ghost btn-sm">Détacher</button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { ItemEditor });
