// Orders — "Commandes" — redesigned
// Key moves: cleaner status colors, inline customer, grouped filters, bulk actions.

function Orders({ theme = 'dark' }) {
  const orders = [
    { id:357, src:'Website', type:'Pickup', items:['LR','SD','SD','+1'], status:'served', pay:'unpaid', total:150 },
    { id:354, src:'Website', type:'Pickup', items:['LR','SD','C','+1'], status:'in-kitchen', pay:'unpaid', total:150 },
    { id:353, src:'Website', type:'Pickup', items:['LR','SD','BM'], status:'in-kitchen', pay:'unpaid', total:150 },
    { id:348, src:'Website', type:'Pickup', items:['LR','LR','PD','+2'], status:'served', pay:'paid', total:200 },
    { id:346, src:'Website', type:'Delivery', items:['SD','LR','C','+13'], status:'pending', pay:'unpaid', total:590 },
    { id:344, src:'Phone', type:'Dine-in', items:['BR','CH','PD'], status:'ready', pay:'paid', total:275 },
    { id:341, src:'Website', type:'Delivery', items:['LR','SD'], status:'accepted', pay:'paid', total:110 },
    { id:338, src:'Walk-in', type:'Pickup', items:['CH','LR','PD','+3'], status:'served', pay:'paid', total:320 },
  ];
  const statusMap = {
    pending: { label:'En attente', cls:'badge-warning' },
    accepted: { label:'Acceptée', cls:'badge-info' },
    'in-kitchen': { label:'En cuisine', cls:'badge-warning' },
    ready: { label:'Prête', cls:'badge-info' },
    served: { label:'Servie', cls:'badge-success' },
  };
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="orders" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Commandes']}/>
          <main className="main">
            <div className="page-head">
              <div>
                <h1 className="page-title">Commandes</h1>
                <p className="page-desc">47 commandes aujourd'hui · 11 en cours</p>
              </div>
              <div className="hstack">
                <span className="badge badge-success"><span className="badge-dot"/>En ligne</span>
                <button className="btn btn-secondary"><Icon name="volume" size={14}/></button>
                <button className="btn btn-primary"><Icon name="plus" size={14}/> Nouvelle commande</button>
              </div>
            </div>

            {/* Status tabs with live counts */}
            <div className="hstack" style={{marginBottom:'var(--s-5)', justifyContent:'space-between'}}>
              <div className="tabs-underline">
                {[
                  { label:'Toutes', n:47, active:false },
                  { label:'Actives', n:11, active:true, dot:true },
                  { label:'Programmées', n:4 },
                  { label:'Terminées', n:32 },
                  { label:'Annulées', n:0 },
                ].map((t, i) => (
                  <button key={i} className="tab-underline" aria-selected={t.active}>
                    {t.dot && <span className="dot-pulse" style={{display:'inline-block', marginRight:8, verticalAlign:'middle'}}/>}
                    {t.label}
                    <span className="count" style={{marginLeft:6, fontSize:10}}>{t.n}</span>
                  </button>
                ))}
              </div>
              <div className="hstack">
                <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>Mise à jour il y a 3s</span>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="refresh" size={14}/></button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="hstack" style={{marginBottom:'var(--s-4)'}}>
              <div className="input-group" style={{width:280}}>
                <Icon name="search" size={14}/>
                <input placeholder="Rechercher n° / client / article…"/>
              </div>
              <button className="chip" aria-pressed="false"><Icon name="calendar" size={12}/> Aujourd'hui</button>
              <button className="chip" aria-pressed="false">Type · Tous</button>
              <button className="chip" aria-pressed="false">Paiement · Tous</button>
              <button className="chip" aria-pressed="false">Source · Tous</button>
              <div style={{flex:1}}/>
              <button className="btn btn-ghost btn-sm"><Icon name="save" size={14}/> Enregistrer vue</button>
              <button className="btn btn-ghost btn-sm"><Icon name="sliders" size={14}/> Colonnes</button>
            </div>

            {/* Table */}
            <div className="table-shell">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{width:32}}><input type="checkbox"/></th>
                    <th>N°</th>
                    <th>Client · Source</th>
                    <th>Type</th>
                    <th>Articles</th>
                    <th>Statut</th>
                    <th>Paiement</th>
                    <th style={{textAlign:'right'}}>Total</th>
                    <th>Temps</th>
                    <th style={{width:40}}/>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => {
                    const s = statusMap[o.status];
                    return (
                      <tr key={i}>
                        <td><input type="checkbox"/></td>
                        <td><span className="num" style={{fontWeight:600}}>#{o.id}</span></td>
                        <td>
                          <div style={{fontSize:'var(--fs-sm)', color:'var(--fg)'}}>Sarah Cohen</div>
                          <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{o.src}</div>
                        </td>
                        <td><span className="badge badge-neutral">{o.type}</span></td>
                        <td>
                          <div style={{display:'flex', gap:4}}>
                            {o.items.map((it, idx) => (
                              <span key={idx} style={{
                                display:'inline-grid', placeItems:'center',
                                width:28, height:28, borderRadius:'50%',
                                background: it.startsWith('+') ? 'var(--surface-3)' : `var(--cat-${(idx%6)+1})`,
                                color: it.startsWith('+') ? 'var(--fg-muted)' : '#fff',
                                fontSize:10, fontWeight:600
                              }}>{it}</span>
                            ))}
                          </div>
                        </td>
                        <td><span className={`badge ${s.cls}`}><span className="badge-dot"/>{s.label}</span></td>
                        <td><span className={`badge ${o.pay === 'paid' ? 'badge-success' : 'badge-warning'}`}>{o.pay === 'paid' ? 'Payée' : 'À payer'}</span></td>
                        <td style={{textAlign:'right'}} className="num">₪{o.total}</td>
                        <td className="subtle" style={{fontSize:'var(--fs-xs)'}}><Icon name="clock" size={12}/> 8 min</td>
                        <td><button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Orders });
