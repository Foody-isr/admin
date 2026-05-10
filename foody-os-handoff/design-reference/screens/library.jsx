// Article Library — "Bibliothèque d'articles"
function Library({ theme = 'dark' }) {
  const items = [
    { name:'AIL CONFIT 150 ML', cat:'ESSENTIALS', dispo:true, price:35 },
    { name:'BETTERAVE', cat:'SALADES', dispo:true, price:25 },
    { name:'BRIWATE', cat:'PATISSERIES', dispo:true, price:60 },
    { name:'BROWNIE CHOCO XL', cat:'PATISSERIES', dispo:true, price:130 },
    { name:'BTSOL MARDNOUSS', cat:'VIANDE', dispo:true, price:75 },
    { name:'CAKE AU CITRON XL', cat:'PATISSERIES', dispo:true, price:110 },
    { name:'CAROTTE', cat:'SALADES', dispo:true, price:25 },
    { name:'CAVIAR', cat:'SALADES', variants:2, dispo:true, price:null },
    { name:'CHOUX', cat:'SALADES', dispo:false, price:25 },
    { name:"L'OR ROUGE", cat:'SALADES', dispo:true, price:35, hot:true },
  ];
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="menu.items" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Articles', "Bibliothèque d'articles"]}/>
          <main className="main">
            <div className="page-head">
              <div>
                <h1 className="page-title">Bibliothèque d'articles</h1>
                <p className="page-desc">Gérez votre catalogue de produits · 35 articles</p>
              </div>
              <div className="hstack">
                <button className="btn btn-secondary"><Icon name="box" size={14}/> Importer</button>
                <button className="btn btn-primary"><Icon name="plus" size={14}/> Créer un article</button>
              </div>
            </div>

            {/* KPI strip */}
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
              {[
                { l:'Total articles', v:'35', s:'dans 6 catégories' },
                { l:'Disponibles', v:'33', s:'2 masqués' },
                { l:'Prix moyen', v:'₪55.46', s:'HT' },
                { l:'Rupture', v:'1', s:'CHOUX indisponible' },
              ].map((k, i) => (
                <div className="kpi" key={i}>
                  <div className="kpi-label">{k.l}</div>
                  <div className="kpi-value">{k.v}</div>
                  <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{k.s}</div>
                </div>
              ))}
            </div>

            <div className="hstack" style={{marginBottom:'var(--s-4)'}}>
              <div className="input-group" style={{width:320}}>
                <Icon name="search" size={14}/>
                <input placeholder="Rechercher un article…"/>
              </div>
              <button className="chip" aria-pressed="false">Catégorie · Tous <Icon name="chevronDown" size={12}/></button>
              <button className="chip" aria-pressed="false">Disponibilité · Tous</button>
              <button className="chip" aria-pressed="false">Cartes · Tous</button>
              <div style={{flex:1}}/>
              <button className="btn btn-ghost btn-sm"><Icon name="sliders" size={14}/> Colonnes</button>
              <button className="btn btn-ghost btn-sm">Actions <Icon name="chevronDown" size={12}/></button>
            </div>

            {/* Category pills */}
            <div className="hstack" style={{marginBottom:'var(--s-4)', flexWrap:'wrap'}}>
              <button className="chip" aria-pressed="true">Tous <span style={{opacity:.7, marginLeft:4}}>35</span></button>
              <button className="chip">Salades <span style={{opacity:.6, marginLeft:4}}>12</span></button>
              <button className="chip">Poissons <span style={{opacity:.6, marginLeft:4}}>3</span></button>
              <button className="chip">Pâtisseries <span style={{opacity:.6, marginLeft:4}}>8</span></button>
              <button className="chip">Essentials <span style={{opacity:.6, marginLeft:4}}>5</span></button>
              <button className="chip">Viande <span style={{opacity:.6, marginLeft:4}}>4</span></button>
              <button className="chip">Comfort food <span style={{opacity:.6, marginLeft:4}}>3</span></button>
            </div>

            <div className="table-shell">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{width:32}}><input type="checkbox"/></th>
                    <th>Article ↑</th>
                    <th>Catégorie</th>
                    <th>Disponibilité</th>
                    <th style={{textAlign:'right'}}>Prix</th>
                    <th>Marge</th>
                    <th style={{width:100}}/>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{background:'var(--surface-2)'}}>
                    <td colSpan={7} style={{padding:'var(--s-2) var(--s-4)'}}>
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--brand-500)'}}><Icon name="plus" size={12}/> Création rapide</button>
                    </td>
                  </tr>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><input type="checkbox"/></td>
                      <td>
                        <div className="hstack" style={{gap:'var(--s-3)'}}>
                          <div style={{width:36, height:36, borderRadius:8, background:`var(--cat-${(i%6)+1})`, opacity:.9, display:'grid', placeItems:'center', color:'#fff', fontSize:'var(--fs-xs)', fontWeight:700}}>{it.name[0]}</div>
                          <div>
                            <div style={{fontSize:'var(--fs-sm)', color:'var(--fg)', fontWeight:500}}>
                              {it.name} {it.hot && <span className="badge badge-brand" style={{marginLeft:6}}>★ Top</span>}
                            </div>
                            {it.variants && <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{it.variants} variantes</div>}
                          </div>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{it.cat}</span></td>
                      <td>
                        <span className={`badge ${it.dispo ? 'badge-success' : 'badge-danger'}`}>
                          <span className="badge-dot"/>{it.dispo ? 'Disponible' : 'Rupture'}
                        </span>
                      </td>
                      <td style={{textAlign:'right'}} className="num">{it.price ? `₪${it.price.toFixed(2)}` : '—'}</td>
                      <td>
                        {it.price && (
                          <div className="hstack">
                            <div style={{width:60, height:4, background:'var(--surface-2)', borderRadius:2, overflow:'hidden'}}>
                              <div style={{width:(Math.random()*40+40)+'%', height:'100%', background:'var(--success-500)'}}/>
                            </div>
                            <span className="num subtle" style={{fontSize:'var(--fs-xs)'}}>{Math.round(Math.random()*20+55)}%</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="hstack" style={{justifyContent:'flex-end'}}>
                          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="eye" size={14}/></button>
                          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={14}/></button>
                          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Library });
