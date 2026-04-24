// Préparations — "Cuisine › Préparations"
// Sub-recipes (stocks, sauces, bases) that are used inside plated recipes.
// Each prep has a yield qty, a unit, a per-unit cost (computed from its recipe), and usage count.

function Preparations({ theme = 'dark' }) {
  const preps = [
    { n:'Fond de volaille',      cat:'Bases',     y:'5 L',    pu:'3.20 ₪/L',    cost:16.00, used:6, upd:'il y a 2 j', st:'fresh' },
    { n:'Sauce tomate maison',   cat:'Sauces',    y:'3.5 L',  pu:'6.40 ₪/L',    cost:22.40, used:9, upd:'hier',        st:'fresh' },
    { n:'Mayonnaise citron',     cat:'Sauces',    y:'1.2 L',  pu:'11.50 ₪/L',   cost:13.80, used:4, upd:'il y a 4 j',  st:'expiring' },
    { n:'Vinaigrette balsamique',cat:'Sauces',    y:'900 ml', pu:'9.20 ₪/L',    cost:8.28,  used:3, upd:'hier',        st:'fresh' },
    { n:'Pâte à pizza',          cat:'Boulange',  y:'24 pc',  pu:'1.80 ₪/pc',   cost:43.20, used:5, upd:'ce matin',    st:'fresh' },
    { n:'Guacamole',             cat:'Mises',     y:'600 g',  pu:'14.20 ₪/kg',  cost:8.52,  used:2, upd:'il y a 6 j',  st:'expired' },
    { n:'Houmous',               cat:'Mises',     y:'2 kg',   pu:'12.80 ₪/kg',  cost:25.60, used:8, upd:'hier',        st:'fresh' },
    { n:'Oignons confits',       cat:'Mises',     y:'800 g',  pu:'18.50 ₪/kg',  cost:14.80, used:4, upd:'il y a 3 j',  st:'fresh' },
    { n:'Bouillon de légumes',   cat:'Bases',     y:'4 L',    pu:'2.10 ₪/L',    cost:8.40,  used:7, upd:'il y a 2 j',  st:'fresh' },
    { n:'Crème pâtissière',      cat:'Pâtisserie',y:'1.5 kg', pu:'16.90 ₪/kg',  cost:25.35, used:3, upd:'hier',        st:'fresh' },
  ];

  const cats = ['Bases', 'Sauces', 'Mises', 'Boulange', 'Pâtisserie'];

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="kitchen.prep" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Cuisine', 'Préparations']}/>
          <main className="main">
            <div className="page-head">
              <div>
                <h1 className="page-title">Préparations</h1>
                <p className="page-desc">Sous-recettes et bases réutilisées dans vos plats · {preps.length} préparations actives</p>
              </div>
              <div className="hstack">
                <button className="btn btn-secondary"><Icon name="refresh" size={14}/> Recalculer les coûts</button>
                <button className="btn btn-primary"><Icon name="plus" size={14}/> Nouvelle préparation</button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
              <div className="kpi">
                <div className="kpi-label">Préparations actives</div>
                <div className="kpi-value">{preps.length}</div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{cats.length} catégories</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Coût total en stock</div>
                <div className="kpi-value">₪186<span style={{fontSize:'var(--fs-lg)', color:'var(--fg-muted)'}}>.35</span></div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>HT · basé sur recettes</div>
              </div>
              <div className="kpi" style={{background:'color-mix(in oklab, var(--warning-500) 8%, var(--surface))', borderColor:'color-mix(in oklab, var(--warning-500) 30%, var(--line))'}}>
                <div className="kpi-label">À consommer bientôt</div>
                <div className="kpi-value" style={{color:'var(--warning-500)'}}>2</div>
                <div style={{fontSize:'var(--fs-xs)', color:'var(--warning-500)'}}>
                  <Icon name="clock" size={12}/> DLC &lt; 48h
                </div>
              </div>
              <div className="kpi" style={{background:'color-mix(in oklab, var(--danger-500) 6%, var(--surface))', borderColor:'color-mix(in oklab, var(--danger-500) 25%, var(--line))'}}>
                <div className="kpi-label">Périmées</div>
                <div className="kpi-value" style={{color:'var(--danger-500)'}}>1</div>
                <div style={{fontSize:'var(--fs-xs)', color:'var(--danger-500)'}}>
                  <Icon name="warn" size={12}/> À jeter
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="hstack" style={{marginBottom:'var(--s-4)'}}>
              <div className="input-group" style={{width:320}}>
                <Icon name="search" size={14}/>
                <input placeholder="Rechercher une préparation…"/>
              </div>
              <button className="chip">Catégorie · Tous</button>
              <button className="chip">Statut · Tous</button>
              <button className="chip">Utilisé dans · Tous les plats</button>
              <div style={{flex:1}}/>
              <button className="btn btn-ghost btn-sm">Actions <Icon name="chevronDown" size={12}/></button>
            </div>

            <div className="hstack" style={{marginBottom:'var(--s-4)', flexWrap:'wrap'}}>
              <button className="chip" aria-pressed="true">Tous</button>
              {cats.map(c => <button className="chip" key={c}>{c}</button>)}
            </div>

            {/* Table */}
            <div className="table-shell">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{width:32}}><input type="checkbox"/></th>
                    <th>Préparation ↑</th>
                    <th>Catégorie</th>
                    <th style={{textAlign:'right'}}>Rendement</th>
                    <th style={{textAlign:'right'}}>Prix unitaire</th>
                    <th style={{textAlign:'right'}}>Coût en stock</th>
                    <th style={{textAlign:'center'}}>Utilisé dans</th>
                    <th>Mise à jour</th>
                    <th>Statut</th>
                    <th style={{width:40}}/>
                  </tr>
                </thead>
                <tbody>
                  {preps.map((r, i) => (
                    <tr key={i}>
                      <td><input type="checkbox"/></td>
                      <td>
                        <div className="hstack">
                          <div style={{
                            width:36, height:36, borderRadius:8,
                            background:'linear-gradient(135deg, var(--surface-3), var(--surface-2))',
                            display:'grid', placeItems:'center', color:'var(--fg-muted)',
                          }}>
                            <Icon name="layers" size={16}/>
                          </div>
                          <span style={{fontWeight:500}}>{r.n}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{r.cat}</span></td>
                      <td style={{textAlign:'right'}} className="num">{r.y}</td>
                      <td style={{textAlign:'right'}} className="num subtle" style={{fontSize:'var(--fs-xs)'}}>{r.pu}</td>
                      <td style={{textAlign:'right', fontWeight:600}} className="num">₪{r.cost.toFixed(2)}</td>
                      <td style={{textAlign:'center'}}>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          padding:'2px 8px', borderRadius:999,
                          background:'var(--surface-2)', color:'var(--fg-muted)',
                          fontSize:'var(--fs-xs)', fontWeight:500,
                        }}>
                          {r.used} plat{r.used > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="subtle" style={{fontSize:'var(--fs-xs)'}}>{r.upd}</td>
                      <td>
                        {r.st === 'fresh' ? <span className="badge badge-success"><span className="badge-dot"/>Frais</span>
                          : r.st === 'expiring' ? <span className="badge badge-warning"><Icon name="clock" size={12}/>Bientôt</span>
                          : <span className="badge badge-danger"><Icon name="warn" size={12}/>Périmé</span>}
                      </td>
                      <td><button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button></td>
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

Object.assign(window, { Preparations });
