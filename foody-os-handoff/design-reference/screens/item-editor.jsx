// Item Editor — "Modifier l'article" — drawer/modal pattern
function ItemEditor({ theme = 'dark', tab = 'cost', composer = false, editRow = false, composerState = 'default', helpOpen = false, createPrep = false }) {
  // composerState: 'default' | 'searchResults' | 'searchEmpty'
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', width:'100%', position:'relative', background:'#050504'}}>
      {/* Dimmed app behind */}
      <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.5)'}}/>
      {/* Modal */}
      <div style={{position:'absolute', top:32, left:24, right:24, bottom:24, background:'var(--bg)', borderRadius:'var(--r-xl)', border:'1px solid var(--line)', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-3)'}}>
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
            {tab === 'recipe' && <RecipeTab composer={composer} editRow={editRow} composerState={composerState} helpOpen={helpOpen}/>}
            {tab === 'details' && <DetailsTab/>}
            {tab === 'mods' && <ModsTab/>}
          </div>
        </div>
      </div>

      {/* Create-preparation sub-sheet — overlays editor, stays contained */}
      {createPrep && <CreatePrepSheet/>}
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

function RecipeTab({ composer = false, editRow = false, composerState = 'default', helpOpen = false }) {
  return (
    <>
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Recette
      </div>
      <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
        <div>
          <div style={{fontWeight:600}}>ingredients <span className="muted" style={{fontWeight:400}}>· 3 éléments</span></div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Liste des ingrédients nécessaires pour cette recette</div>
        </div>
        {!composer && !editRow && (
          <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={14}/> Ajouter un ingrédient</button>
        )}
      </div>
      <div className="vstack" style={{gap:'var(--s-2)', marginBottom:'var(--s-5)'}}>
        {editRow ? (
          <IngredientRowEditing/>
        ) : (
          <IngredientRowCollapsed
            icon="flask"
            iconBg="#7c3aed"
            name="PRÉPARATION OR ROUGE"
            badge={<span className="badge badge-brand" style={{marginLeft:6}}>Préparation</span>}
            meta="— Adapté à la taille"
          />
        )}
        <IngredientRowCollapsed
          icon="box"
          iconBg="#2563eb"
          name="Boîte plastique 250g"
          badge={<span className="badge" style={{marginLeft:6, background:'color-mix(in oklab, #2563eb 15%, transparent)', color:'#60a5fa', border:'1px solid color-mix(in oklab, #2563eb 30%, transparent)'}}>Ingrédient brut</span>}
          qtyMain="1 unit"
          qtySub="Quantité fixe"
        />
        <IngredientRowCollapsed
          icon="box"
          iconBg="#2563eb"
          name="Étiquette"
          badge={<span className="badge" style={{marginLeft:6, background:'color-mix(in oklab, #2563eb 15%, transparent)', color:'#60a5fa', border:'1px solid color-mix(in oklab, #2563eb 30%, transparent)'}}>Ingrédient brut</span>}
          qtyMain="1 unit"
          qtySub="Quantité fixe"
        />

        {composer && <IngredientComposer state={composerState} helpOpen={helpOpen}/>}
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

function IngredientComposer({ state = 'default', helpOpen = false }) {
  // Inline composer — replaces the old modal-on-modal dialog.
  // Anchored in the ingredient list with a brand accent bar.
  // state: 'default' (picked + usage mode) | 'searchResults' (typing, matches + create) | 'searchEmpty' (no results, only create CTAs)
  return (
    <div
      className="card"
      style={{
        padding: 0,
        border: '1px solid var(--brand-500)',
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--brand-500) 15%, transparent)',
        overflow: 'visible',
        position: 'relative',
      }}
    >
      {/* Brand accent bar on the left */}
      <div style={{position:'absolute', left:0, top:0, bottom:0, width:3, background:'var(--brand-500)', borderTopLeftRadius:'var(--r-lg)', borderBottomLeftRadius:'var(--r-lg)'}}/>

      {/* Header */}
      <div style={{padding:'var(--s-3) var(--s-4)', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:'var(--s-3)', background:'color-mix(in oklab, var(--brand-500) 5%, var(--surface))'}}>
        <Icon name="plus" size={14}/>
        <div style={{fontSize:'var(--fs-sm)', fontWeight:600, flex:1}}>Ajouter un ingrédient</div>
        <div style={{position:'relative'}}>
          <button className="btn btn-ghost btn-sm" style={{color:'var(--fg-subtle)', fontSize:'var(--fs-xs)'}} title="Aide"><Icon name="info" size={12}/> Comment choisir ?</button>
          {helpOpen && <HelpPopover/>}
        </div>
        <kbd style={{fontSize:'var(--fs-xs)', fontFamily:'var(--font-mono)', padding:'2px 6px', border:'1px solid var(--line)', borderRadius:4, color:'var(--fg-subtle)'}}>Esc</kbd>
        <button className="btn btn-ghost btn-icon btn-sm" title="Fermer"><Icon name="x" size={14}/></button>
      </div>

      {/* Body */}
      <div style={{padding:'var(--s-4)'}}>
        {/* Search input — varies per state */}
        <div style={{position:'relative'}}>
          <div className="input-group" style={{paddingLeft:'var(--s-3)'}}>
            <Icon name="search" size={14}/>
            {state === 'default' && (
              <>
                <input defaultValue="PRÉPARATION CAROTTE RONDELLES (kg (Prép.))" style={{fontWeight:500}}/>
                <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--fg-subtle)'}} title="Effacer"><Icon name="x" size={12}/></button>
              </>
            )}
            {state === 'searchResults' && (
              <>
                <input defaultValue="or" style={{fontWeight:500}}/>
                <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>2 résultats</span>
              </>
            )}
            {state === 'searchEmpty' && (
              <>
                <input defaultValue="or rouge" style={{fontWeight:500}}/>
                <span className="subtle" style={{fontSize:'var(--fs-xs)', color:'var(--fg-subtle)'}}>0 résultat</span>
              </>
            )}
          </div>
        </div>

        {/* Search results dropdown */}
        {state === 'searchResults' && <SearchResultsList/>}
        {state === 'searchEmpty' && <SearchEmptyCreateCards query="or rouge"/>}

        {/* Helper label — only when an ingredient is picked */}
        {state === 'default' && <>
        <div style={{marginTop:'var(--s-4)', display:'flex', alignItems:'center', gap:6, fontSize:'var(--fs-sm)', fontWeight:500}}>
          Comment cet ingrédient est-il utilisé ?
          <span className="subtle" style={{color:'var(--fg-subtle)'}}><Icon name="info" size={12}/></span>
        </div>

        {/* Usage mode segmented control */}
        <div className="hstack" style={{gap:'var(--s-2)', marginTop:'var(--s-2)'}}>
          <button className="chip" aria-pressed="true"><Icon name="edit" size={12}/> Adapter à la taille</button>
          <button className="chip"><Icon name="pin" size={12}/> Quantité fixe</button>
          <button className="chip"><Icon name="layers" size={12}/> Personnalisé par variante</button>
        </div>

        {/* Contextual helper based on selected mode */}
        <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:'var(--s-2)', fontStyle:'italic'}}>
          Quantité = portion de chaque variante (ex. Normal = 250 g, Grand = 500 g).
        </div>

        {/* Quantity inputs — appears after mode is chosen */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--s-3)', marginTop:'var(--s-4)'}}>
          <div>
            <label style={{fontSize:'var(--fs-xs)', fontWeight:500, marginBottom:4, display:'block', color:'var(--fg-subtle)'}}>Normal</label>
            <div className="input-group"><input defaultValue="250"/><span className="muted">g</span></div>
          </div>
          <div>
            <label style={{fontSize:'var(--fs-xs)', fontWeight:500, marginBottom:4, display:'block', color:'var(--fg-subtle)'}}>Grand</label>
            <div className="input-group"><input defaultValue="500"/><span className="muted">g</span></div>
          </div>
        </div>

        {/* Cost preview */}
        <div className="hstack" style={{justifyContent:'space-between', marginTop:'var(--s-4)', padding:'var(--s-3)', background:'var(--surface-2)', borderRadius:'var(--r-md)'}}>
          <div>
            <div style={{fontSize:'var(--fs-xs)', color:'var(--fg-subtle)'}}>Coût estimé par portion</div>
            <div className="num" style={{fontSize:'var(--fs-md)', fontWeight:600, color:'var(--brand-500)'}}>₪0.34 — ₪0.68</div>
          </div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Basé sur ₪1.36 / kg</div>
        </div>
        </>}
      </div>

      {/* Footer actions — only when ingredient is selected */}
      {state === 'default' && (
        <div className="hstack" style={{padding:'var(--s-3) var(--s-4)', borderTop:'1px solid var(--line)', background:'var(--surface)', justifyContent:'flex-end', gap:'var(--s-2)'}}>
          <button className="btn btn-ghost btn-sm">Annuler</button>
          <button className="btn btn-secondary btn-sm"><Icon name="plus" size={12}/> Ajouter et continuer</button>
          <button className="btn btn-primary btn-sm"><Icon name="check" size={12}/> Ajouter</button>
        </div>
      )}
      {(state === 'searchResults' || state === 'searchEmpty') && (
        <div className="hstack" style={{padding:'var(--s-3) var(--s-4)', borderTop:'1px solid var(--line)', background:'var(--surface)', justifyContent:'flex-end', gap:'var(--s-2)'}}>
          <button className="btn btn-ghost btn-sm">Annuler</button>
          <button className="btn btn-primary btn-sm" disabled style={{opacity:.5}}><Icon name="check" size={12}/> Ajouter</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Search results list — shown when user types and matches exist
function SearchResultsList() {
  const rows = [
    { type:'Ingrédient brut', icon:'box', iconBg:'#10b981', name:'Huile d\'OLIVE', meta:'₪ 28 / L · Stock OK' },
    { type:'Préparation', icon:'flask', iconBg:'#7c3aed', name:'PRÉPARATION OR ROUGE', meta:'Recette · 2 kg/lot' },
  ];
  return (
    <div className="vstack" style={{gap:'var(--s-1)', marginTop:'var(--s-3)', border:'1px solid var(--line)', borderRadius:'var(--r-md)', padding:'var(--s-2)', background:'var(--surface-2)'}}>
      <div style={{fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--fg-subtle)', padding:'var(--s-1) var(--s-2)', textTransform:'uppercase', letterSpacing:'.06em'}}>Résultats existants</div>
      {rows.map((r, i) => (
        <button key={i} className="card" style={{display:'flex', alignItems:'center', gap:'var(--s-3)', padding:'var(--s-2) var(--s-3)', textAlign:'left', cursor:'pointer', background:i===0 ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))' : 'var(--surface)', border:i===0 ? '1px solid var(--brand-500)' : '1px solid var(--line)'}}>
          <div style={{width:28, height:28, borderRadius:'50%', background:r.iconBg, display:'grid', placeItems:'center', color:'#fff', flexShrink:0}}>
            <Icon name={r.icon} size={12}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:500, fontSize:'var(--fs-sm)'}}>{r.name}</div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>
              <span className="badge badge-neutral" style={{marginRight:6, fontSize:10}}>{r.type}</span>
              {r.meta}
            </div>
          </div>
          {i === 0 && <kbd style={{fontSize:'var(--fs-xs)', fontFamily:'var(--font-mono)', padding:'2px 6px', border:'1px solid var(--line)', borderRadius:4, color:'var(--fg-subtle)'}}>↵</kbd>}
        </button>
      ))}
      <div style={{fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--fg-subtle)', padding:'var(--s-2) var(--s-2) var(--s-1)', textTransform:'uppercase', letterSpacing:'.06em', marginTop:'var(--s-1)'}}>Créer nouveau</div>
      <CreateCards query="or" compact/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Empty state — query returned nothing; show only create CTAs
function SearchEmptyCreateCards({ query }) {
  return (
    <div className="vstack" style={{gap:'var(--s-3)', marginTop:'var(--s-4)'}}>
      <div className="hstack" style={{gap:'var(--s-2)', padding:'var(--s-3) var(--s-4)', background:'color-mix(in oklab, var(--warning-500) 10%, transparent)', border:'1px solid color-mix(in oklab, var(--warning-500) 30%, transparent)', borderRadius:'var(--r-md)', fontSize:'var(--fs-sm)'}}>
          <Icon name="search" size={14}/>
          <span>Aucun ingrédient ou préparation pour <strong>« {query} »</strong>. Créez-le maintenant :</span>
      </div>
      <CreateCards query={query}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// The two "create" cards — shared between empty + results states
function CreateCards({ query, compact = false }) {
  const cards = [
    {
      icon: 'box', iconBg: '#10b981',
      kind: 'Ingrédient brut',
      tagline: 'Un produit que vous achetez et utilisez tel quel.',
      examples: 'Tomate, huile, sel, pain, bœuf cru…',
    },
    {
      icon: 'flask', iconBg: '#7c3aed',
      kind: 'Préparation',
      tagline: 'Une recette que vous fabriquez en cuisine.',
      examples: 'Sauce maison, fond, vinaigrette, pâte…',
    },
  ];
  return (
    <div className="vstack" style={{gap:'var(--s-2)'}}>
      {cards.map((c, i) => (
        <button key={i} className="card" style={{
          display:'flex', alignItems:'flex-start', gap:'var(--s-3)',
          padding: compact ? 'var(--s-2) var(--s-3)' : 'var(--s-3) var(--s-4)',
          textAlign:'left', cursor:'pointer', background:'var(--surface)',
          border:'1px solid var(--line)', transition:'all var(--dur-fast)',
        }}>
          <div style={{width:32, height:32, borderRadius:'50%', background:c.iconBg, display:'grid', placeItems:'center', color:'#fff', flexShrink:0, marginTop:2}}>
            <Icon name={c.icon} size={14}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:600, fontSize:'var(--fs-sm)', display:'flex', alignItems:'center', gap:6}}>
              Créer <span style={{color:c.iconBg}}>{c.kind}</span>
              <span className="num" style={{fontWeight:500, color:'var(--fg-subtle)'}}>« {query} »</span>
            </div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:2}}>{c.tagline}</div>
            {!compact && <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:4, fontStyle:'italic', color:'var(--fg-subtle)'}}>≫ {c.examples}</div>}
          </div>
          <Icon name="chevronRight" size={14}/>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Help popover — anchored under the "Comment choisir ?" button
function HelpPopover() {
  return (
    <div style={{
      position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:10,
      width:340, padding:'var(--s-4)',
      background:'var(--surface)', border:'1px solid var(--line)',
      borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-3)',
      fontSize:'var(--fs-sm)', lineHeight:1.5,
    }}>
      <div style={{fontWeight:600, marginBottom:'var(--s-3)', display:'flex', alignItems:'center', gap:6}}>
        <Icon name="info" size={14}/> Brut ou Préparation ?
      </div>

      <div style={{marginBottom:'var(--s-3)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, fontWeight:600, color:'#10b981'}}>
          <span style={{width:20, height:20, borderRadius:'50%', background:'#10b981', display:'grid', placeItems:'center', color:'#fff'}}><Icon name="box" size={10}/></span>
          Ingrédient brut
        </div>
        <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:4, paddingLeft:26}}>
          Vous l'achetez tel quel chez votre fournisseur. Stock en kg, L ou unités.<br/>
          <em style={{color:'var(--fg-subtle)'}}>Ex: tomate, huile d'olive, pain, bœuf cru…</em>
        </div>
      </div>

      <div style={{marginBottom:'var(--s-3)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, fontWeight:600, color:'#a78bfa'}}>
          <span style={{width:20, height:20, borderRadius:'50%', background:'#7c3aed', display:'grid', placeItems:'center', color:'#fff'}}><Icon name="flask" size={10}/></span>
          Préparation
        </div>
        <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:4, paddingLeft:26}}>
          Vous la fabriquez en cuisine à partir d'autres ingrédients. Elle a sa propre recette et un rendement.<br/>
          <em style={{color:'var(--fg-subtle)'}}>Ex: sauce tomate maison, fond de volaille, pâte à pizza…</em>
        </div>
      </div>

      <div style={{padding:'var(--s-2) var(--s-3)', background:'color-mix(in oklab, var(--brand-500) 8%, transparent)', border:'1px solid color-mix(in oklab, var(--brand-500) 25%, transparent)', borderRadius:'var(--r-md)', fontSize:'var(--fs-xs)', display:'flex', gap:6}}>
        <Icon name="info" size={12}/>
        <span>Une préparation peut contenir d'autres préparations (ex: un fond utilisé dans une sauce).</span>
      </div>
    </div>
  );
}

function IngredientRowCollapsed({ icon, iconBg, name, badge, meta, qtyMain, qtySub }) {
  return (
    <div className="card" style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
      <div style={{width:36, height:36, borderRadius:'50%', background:iconBg, display:'grid', placeItems:'center', color:'#fff', flexShrink:0}}>
        <Icon name={icon} size={16}/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:500}}>{name}{badge}</div>
      </div>
      {meta && <div className="muted" style={{fontSize:'var(--fs-sm)'}}>{meta}</div>}
      {qtyMain && (
        <div style={{textAlign:'right', lineHeight:1.3}}>
          <div className="num" style={{fontWeight:500}}>{qtyMain}</div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{qtySub}</div>
        </div>
      )}
      <button className="btn btn-ghost btn-icon btn-sm"><Icon name="chevronDown" size={14}/></button>
      <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
    </div>
  );
}

function IngredientRowEditing() {
  // Inline EDIT state — expands an existing row in place to change its usage mode.
  // Matches reference screenshot: no per-row footer; save/cancel happens at the modal level.
  return (
    <div
      className="card"
      style={{
        padding: 0,
        border: '1px solid var(--brand-500)',
        overflow: 'hidden',
      }}
    >
      {/* Row header — same shape as collapsed row */}
      <div style={{padding:'var(--s-3) var(--s-4)', display:'flex', alignItems:'center', gap:'var(--s-3)', borderBottom:'1px solid var(--line)'}}>
        <div style={{width:36, height:36, borderRadius:'50%', background:'#7c3aed', display:'grid', placeItems:'center', color:'#fff', flexShrink:0}}>
          <Icon name="flask" size={16}/>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontWeight:500}}>PRÉPARATION OR ROUGE <span className="badge badge-brand" style={{marginLeft:6}}>Préparation</span></div>
        </div>
        <div style={{textAlign:'right', lineHeight:1.3}}>
          <div className="num" style={{fontWeight:500}}>—</div>
          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Adapté à la taille</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" title="Replier"><Icon name="chevronUp" size={14}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger-500)'}}><Icon name="trash" size={14}/></button>
      </div>

      {/* Editing body */}
      <div style={{padding:'var(--s-4)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, fontSize:'var(--fs-sm)', fontWeight:500, marginBottom:'var(--s-3)'}}>
          <Icon name="info" size={12}/> Comment cet ingrédient est-il utilisé ?
        </div>

        <div className="hstack" style={{gap:'var(--s-2)'}}>
          <button className="chip" aria-pressed="true" style={{background:'color-mix(in oklab, var(--brand-500) 12%, transparent)', borderColor:'var(--brand-500)', color:'var(--brand-500)'}}>
            <Icon name="edit" size={12}/> Adapter à la taille
          </button>
          <button className="chip"><Icon name="pin" size={12}/> Quantité fixe</button>
          <button className="chip"><Icon name="layers" size={12}/> Personnalisé par variante</button>
        </div>

        {/* Blue helper pill — matches reference */}
        <div style={{
          marginTop:'var(--s-3)',
          padding:'var(--s-3) var(--s-4)',
          background:'color-mix(in oklab, #3b82f6 12%, transparent)',
          border:'1px solid color-mix(in oklab, #3b82f6 35%, transparent)',
          borderRadius:'var(--r-md)',
          fontSize:'var(--fs-sm)',
          color:'#93c5fd',
        }}>
          Quantité = portion de chaque variante (ex. Normal = 250 g, Grand = 500 g).
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Create-preparation sub-sheet — overlays the item editor modal.
// Lets user create a prep inline without navigating away.
function CreatePrepSheet() {
  return (
    <div style={{position:'absolute', inset:0, zIndex:20, display:'grid', placeItems:'center', background:'rgba(0,0,0,.45)'}}>
      <div style={{
        width:'min(720px, 90%)', maxHeight:'85%',
        background:'var(--bg)', border:'1px solid var(--line)',
        borderRadius:'var(--r-xl)', boxShadow:'var(--shadow-3)',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{padding:'var(--s-4) var(--s-5)', borderBottom:'1px solid var(--line)', background:'var(--surface)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
          <div style={{width:36, height:36, borderRadius:'50%', background:'#7c3aed', display:'grid', placeItems:'center', color:'#fff'}}>
            <Icon name="flask" size={16}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600, fontSize:'var(--fs-md)'}}>Nouvelle préparation</div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Une recette fabriquée en cuisine — utilisable comme ingrédient d'autres plats</div>
          </div>
          <button className="btn btn-ghost btn-icon" title="Fermer"><Icon name="x" size={16}/></button>
        </div>

        {/* Body */}
        <div style={{flex:1, overflowY:'auto', padding:'var(--s-5)'}}>
          {/* Basics row */}
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
            <div>
              <label style={{fontSize:'var(--fs-xs)', fontWeight:600, marginBottom:6, display:'block', color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'.04em'}}>Nom</label>
              <input className="input" defaultValue="OR ROUGE" style={{fontWeight:500}}/>
            </div>
            <div>
              <label style={{fontSize:'var(--fs-xs)', fontWeight:600, marginBottom:6, display:'block', color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'.04em'}}>Rendement</label>
              <div className="input-group"><input defaultValue="2"/><span className="muted">kg</span></div>
            </div>
            <div>
              <label style={{fontSize:'var(--fs-xs)', fontWeight:600, marginBottom:6, display:'block', color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'.04em'}}>DLC</label>
              <div className="input-group"><input defaultValue="3"/><span className="muted">jours</span></div>
            </div>
          </div>

          {/* Ingredients */}
          <div style={{marginBottom:'var(--s-4)'}}>
            <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
              <div style={{fontSize:'var(--fs-sm)', fontWeight:600}}>Ingrédients de la préparation</div>
              <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={12}/> Ajouter</button>
            </div>
            <div className="vstack" style={{gap:'var(--s-2)'}}>
              <MiniIngredientRow icon="box" iconBg="#10b981" name="Tomate fraîche" qty="1.2" unit="kg"/>
              <MiniIngredientRow icon="box" iconBg="#10b981" name="Huile d'olive" qty="100" unit="ml"/>
              <MiniIngredientRow icon="box" iconBg="#10b981" name="Ail" qty="3" unit="gousses"/>
              <MiniIngredientRow icon="box" iconBg="#10b981" name="Piment" qty="2" unit="g"/>
            </div>
          </div>

          {/* Cost preview */}
          <div className="hstack" style={{padding:'var(--s-3) var(--s-4)', background:'var(--surface-2)', borderRadius:'var(--r-md)', justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:'var(--fs-xs)', color:'var(--fg-subtle)'}}>Coût de la préparation</div>
              <div className="num" style={{fontSize:'var(--fs-lg)', fontWeight:600, color:'var(--brand-500)'}}>₪18.40</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'var(--fs-xs)', color:'var(--fg-subtle)'}}>Coût au kg</div>
              <div className="num" style={{fontSize:'var(--fs-lg)', fontWeight:600}}>₪9.20 / kg</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="hstack" style={{padding:'var(--s-4) var(--s-5)', borderTop:'1px solid var(--line)', background:'var(--surface)', justifyContent:'space-between'}}>
          <div className="subtle" style={{fontSize:'var(--fs-xs)', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="info" size={12}/>
            Cette préparation sera ajoutée à <strong>L'OR ROUGE</strong> après création.
          </div>
          <div className="hstack">
            <button className="btn btn-ghost btn-sm">Annuler</button>
            <button className="btn btn-primary btn-sm"><Icon name="check" size={14}/> Créer et utiliser</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniIngredientRow({ icon, iconBg, name, qty, unit }) {
  return (
    <div className="card" style={{padding:'var(--s-2) var(--s-3)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
      <div style={{width:28, height:28, borderRadius:'50%', background:iconBg, display:'grid', placeItems:'center', color:'#fff', flexShrink:0}}>
        <Icon name={icon} size={12}/>
      </div>
      <div style={{flex:1, fontSize:'var(--fs-sm)', fontWeight:500}}>{name}</div>
      <div className="input-group" style={{width:120}}>
        <input defaultValue={qty} style={{textAlign:'right'}}/>
        <span className="muted">{unit}</span>
      </div>
      <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger-500)'}}><Icon name="trash" size={12}/></button>
    </div>
  );
}

Object.assign(window, { ItemEditor });
