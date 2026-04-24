// Stock — "Cuisine › Stock"
function Stock({ theme = 'dark' }) {
  const items = [
    { n:'Ail Épluché', cat:'Légumes', q:'1 kg', pu:'30.00 ₪/kg', tva:'0%', val:30.00, sup:'TNUVAT HASADE — PRIMEUR', st:'ok' },
    { n:'Arrières cuisse poulet', cat:'Viande', q:'1 kg', pu:'35.00 ₪/kg', tva:'18%', val:35.00, sup:'—', st:'ok' },
    { n:'Aubergines', cat:'Légumes', q:'2.73 kg', pu:'9.90 ₪/kg', tva:'18%', val:27.03, sup:'TNUVAT HASADE', st:'ok' },
    { n:'Avocats', cat:'Fruits', q:'0.63 kg', pu:'14.90 ₪/kg', tva:'18%', val:9.31, sup:'TNUVAT HASADE', st:'low' },
    { n:'Basilic frais', cat:'Légumes', q:'0.12 kg', pu:'45.00 ₪/kg', tva:'18%', val:5.40, sup:'SHUK HACARMEL', st:'low' },
    { n:'Boîte plastique 250g', cat:'Conserves', q:'124 unit', pu:'1.00 ₪/unit', tva:'18%', val:124.00, sup:'PACK PRO', st:'ok' },
    { n:'Câpres', cat:'Condiment', q:'3.2 kg', pu:'28.00 ₪/kg', tva:'18%', val:89.60, sup:'TNUVAT HASADE', st:'ok' },
  ];
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="kitchen.stock" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Cuisine', 'Stock']}/>
          <main className="main">
            <div className="page-head">
              <div>
                <h1 className="page-title">Stock</h1>
                <p className="page-desc">Gérez votre inventaire d'ingrédients · Dernier inventaire il y a 2 jours</p>
              </div>
              <div className="hstack">
                <button className="btn btn-secondary"><Icon name="refresh" size={14}/> Inventaire</button>
                <button className="btn btn-secondary"><Icon name="box" size={14}/> Réception</button>
                <button className="btn btn-primary"><Icon name="plus" size={14}/> Ajouter un article</button>
              </div>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
              <div className="kpi"><div className="kpi-label">Articles en stock</div><div className="kpi-value">64</div><div className="subtle" style={{fontSize:'var(--fs-xs)'}}>11 catégories</div></div>
              <div className="kpi"><div className="kpi-label">Statut OK</div><div className="kpi-value" style={{color:'var(--success-500)'}}>60</div><div className="subtle" style={{fontSize:'var(--fs-xs)'}}>93.7%</div></div>
              <div className="kpi"><div className="kpi-label">Valeur totale</div><div className="kpi-value">₪130,616<span style={{fontSize:'var(--fs-lg)', color:'var(--fg-muted)'}}>.36</span></div><div className="subtle" style={{fontSize:'var(--fs-xs)'}}>HT</div></div>
              <div className="kpi" style={{background:'color-mix(in oklab, var(--warning-500) 8%, var(--surface))', borderColor:'color-mix(in oklab, var(--warning-500) 30%, var(--line))'}}>
                <div className="kpi-label">Alertes stock</div>
                <div className="kpi-value" style={{color:'var(--warning-500)'}}>4</div>
                <div style={{fontSize:'var(--fs-xs)', color:'var(--warning-500)'}}><Icon name="warn" size={12}/> À commander</div>
              </div>
            </div>

            <div className="hstack" style={{marginBottom:'var(--s-4)'}}>
              <div className="input-group" style={{width:320}}>
                <Icon name="search" size={14}/>
                <input placeholder="Rechercher un ingrédient…"/>
              </div>
              <button className="chip">Catégorie · Tous</button>
              <button className="chip">Fournisseur · Tous</button>
              <button className="chip">Statut · Tous</button>
              <div style={{flex:1}}/>
              <button className="btn btn-ghost btn-sm">Actions <Icon name="chevronDown" size={12}/></button>
            </div>

            <div className="hstack" style={{marginBottom:'var(--s-4)', flexWrap:'wrap'}}>
              <button className="chip" aria-pressed="true">Tous</button>
              {['Boissons','Condiment','Conserves','Fruits','Huiles','Légumes','Poissons','Sauces','Viande','Épicerie'].map(c => (
                <button className="chip" key={c}>{c}</button>
              ))}
            </div>

            <div className="table-shell">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{width:32}}><input type="checkbox"/></th>
                    <th>Article ↑</th>
                    <th>Catégorie</th>
                    <th style={{textAlign:'right'}}>Quantité</th>
                    <th style={{textAlign:'right'}}>Prix unitaire</th>
                    <th style={{textAlign:'right'}}>Valeur</th>
                    <th>Fournisseur</th>
                    <th>Statut</th>
                    <th style={{width:40}}/>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <tr key={i}>
                      <td><input type="checkbox"/></td>
                      <td>
                        <div className="hstack">
                          <div style={{width:36, height:36, borderRadius:8, background:'var(--surface-3)', backgroundImage:'repeating-linear-gradient(45deg, rgba(0,0,0,.05) 0 4px, transparent 4px 8px)'}}/>
                          <span style={{fontWeight:500}}>{r.n}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{r.cat}</span></td>
                      <td style={{textAlign:'right'}} className="num">{r.q}</td>
                      <td style={{textAlign:'right'}}><span className="num">{r.pu}</span> <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>TVA {r.tva}</span></td>
                      <td style={{textAlign:'right'}} className="num" style={{fontWeight:600}}>₪{r.val.toFixed(2)}</td>
                      <td className="subtle" style={{fontSize:'var(--fs-xs)'}}>{r.sup}</td>
                      <td>
                        {r.st === 'ok' ? <span className="badge badge-success"><span className="badge-dot"/>OK</span>
                          : <span className="badge badge-warning"><Icon name="warn" size={12}/>Bas</span>}
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

Object.assign(window, { Stock });
