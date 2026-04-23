// Dashboard — "Tableau de bord" — redesigned
// Key moves vs current: clearer info hierarchy, live KPI deltas, integrated AI prompt,
// sparklines inline with KPIs, action cards on right rail, activity feed.

function Dashboard({ theme = 'dark' }) {
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="dashboard" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Accueil']} />
          <main className="main">
            {/* Page head */}
            <div className="page-head">
              <div>
                <h1 className="page-title">Bonjour Tal</h1>
                <p className="page-desc">Mercredi 23 avril · Voici l'activité de Mamie Tlv aujourd'hui</p>
              </div>
              <div className="hstack">
                <div className="tabs">
                  <button className="tab" aria-selected="false">Hier</button>
                  <button className="tab" aria-selected="true">Aujourd'hui</button>
                  <button className="tab" aria-selected="false">7 jours</button>
                  <button className="tab" aria-selected="false">30 jours</button>
                </div>
                <button className="btn btn-secondary"><Icon name="calendar" size={14}/> 23 avril</button>
                <button className="btn btn-ghost btn-icon"><Icon name="refresh"/></button>
              </div>
            </div>

            {/* AI prompt — pinned, above the fold */}
            <div className="card" style={{padding: 'var(--s-4)', marginBottom: 'var(--s-5)', display:'flex', alignItems:'center', gap:'var(--s-3)', background:'linear-gradient(135deg, color-mix(in oklab, var(--brand-500) 4%, var(--surface)), var(--surface))', borderColor: 'color-mix(in oklab, var(--brand-500) 20%, var(--line))'}}>
              <div style={{width:36, height:36, borderRadius: 10, background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)', color:'var(--brand-500)', display:'grid', placeItems:'center'}}>
                <Icon name="sparkles" size={16}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'var(--fs-sm)', color:'var(--fg-muted)'}}>Demandez à Foody AI…</div>
                <div style={{fontSize:'var(--fs-sm)', color:'var(--fg)'}}>"Quels articles ont le meilleur margin cette semaine ?"</div>
              </div>
              <button className="chip" aria-pressed="false">Ventes de la semaine</button>
              <button className="chip" aria-pressed="false">Articles en rupture</button>
              <button className="btn btn-primary btn-sm">Demander</button>
            </div>

            {/* KPI strip — 4 equal */}
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
              {[
                { label:'Revenu brut', value:'₪4,280', delta:'+12.4%', up:true, spark:'up', sub:'vs hier' },
                { label:'Commandes', value:'47', delta:'+6', up:true, spark:'up', sub:'11 en cours' },
                { label:'Ticket moyen', value:'₪91.1', delta:'+4.2%', up:true, spark:'flat', sub:'vs 7j' },
                { label:'Coût matière', value:'28.4%', delta:'−1.3%', up:true, spark:'down', sub:'cible 30%' },
              ].map((k, i) => (
                <div className="kpi card-hover" key={i}>
                  <div className="kpi-label">{k.label}</div>
                  <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'var(--s-3)'}}>
                    <div className="kpi-value">{k.value}</div>
                    <Sparkline trend={k.spark}/>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:'var(--s-2)'}}>
                    <span className={`kpi-delta ${k.up ? 'up' : 'down'}`}>
                      <Icon name={k.up ? 'arrowUp' : 'arrowDown'} size={12}/>{k.delta}
                    </span>
                    <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>{k.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Main row: live orders + right rail */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:'var(--s-5)', marginBottom:'var(--s-5)'}}>
              {/* Revenue chart */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Rendement — 7 derniers jours</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Ventes nettes, hors TVA</div>
                  </div>
                  <div className="hstack">
                    <div className="hstack" style={{gap:'var(--s-3)', fontSize:'var(--fs-xs)'}}>
                      <span className="hstack" style={{gap:6}}><span style={{width:8, height:8, background:'var(--brand-500)', borderRadius:2}}/> Cette semaine</span>
                      <span className="hstack muted" style={{gap:6}}><span style={{width:8, height:8, background:'var(--fg-subtle)', borderRadius:2, opacity:.5}}/> Semaine passée</span>
                    </div>
                  </div>
                </div>
                <div style={{padding:'var(--s-5)'}}>
                  <BarChart />
                </div>
              </div>

              {/* Right rail */}
              <div className="vstack" style={{gap:'var(--s-4)'}}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Actions rapides</div>
                  </div>
                  <div style={{padding:'var(--s-3)'}}>
                    {[
                      { icon:'dollar', label:'Accepter un paiement', sub:'Transaction manuelle' },
                      { icon:'menu', label:'Modifier la carte', sub:'Mettre à jour les articles' },
                      { icon:'plus', label:'Ajouter un article', sub:'Nouveau produit' },
                      { icon:'box', label:'Réceptionner un arrivage', sub:'Mettre à jour le stock' },
                    ].map((a, i) => (
                      <button key={i} className="nav-item" style={{width:'100%'}}>
                        <div style={{width:32, height:32, borderRadius:8, background:'color-mix(in oklab, var(--brand-500) 14%, transparent)', color:'var(--brand-500)', display:'grid', placeItems:'center'}}>
                          <Icon name={a.icon} size={14}/>
                        </div>
                        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2}}>
                          <span style={{fontSize:'var(--fs-sm)', color:'var(--fg)'}}>{a.label}</span>
                          <span style={{fontSize:'var(--fs-xs)', color:'var(--fg-muted)'}}>{a.sub}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card" style={{borderColor:'color-mix(in oklab, var(--success-500) 30%, var(--line))'}}>
                  <div style={{padding:'var(--s-5)'}}>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600}}>Solde à verser</div>
                    <div className="kpi-value" style={{marginTop:'var(--s-3)'}}>₪3,128<span style={{fontSize:'var(--fs-lg)', color:'var(--fg-muted)', marginLeft:6}}>.00</span></div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:'var(--s-2)'}}>Virement prévu vendredi</div>
                    <button className="btn btn-secondary" style={{width:'100%', marginTop:'var(--s-4)'}}>Voir les transactions</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Lower row: Top articles + Activity */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--s-5)'}}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Top articles · Aujourd'hui</div>
                  <button className="btn btn-ghost btn-sm">Voir tout</button>
                </div>
                <div>
                  {[
                    { name:"L'OR ROUGE", cat:'SALADES', sales:10, rev:'₪350.00', pct:82 },
                    { name:"SALADE D'ŒUF", cat:'SALADES', sales:7, rev:'₪245.00', pct:58 },
                    { name:"PATATE DOUCE", cat:'SALADES', sales:6, rev:'₪150.00', pct:36 },
                    { name:"CAVIAR", cat:'SALADES', sales:4, rev:'₪100.00', pct:24 },
                    { name:"BRIWATE", cat:'PATISSERIES', sales:3, rev:'₪180.00', pct:18 },
                  ].map((r, i) => (
                    <div key={i} style={{padding:'var(--s-3) var(--s-5)', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
                      <div style={{width:32, height:32, borderRadius:8, background:'var(--surface-3)', display:'grid', placeItems:'center', color:'var(--fg-muted)', fontSize:10, fontWeight:700}}>{i + 1}</div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:'var(--fs-sm)', color:'var(--fg)', fontWeight:500}}>{r.name}</div>
                        <div style={{fontSize:'var(--fs-xs)', color:'var(--fg-muted)'}}>{r.cat} · {r.sales} ventes</div>
                      </div>
                      <div style={{width:80, height:4, background:'var(--surface-2)', borderRadius:2, overflow:'hidden'}}>
                        <div style={{width:r.pct + '%', height:'100%', background:'var(--brand-500)'}}/>
                      </div>
                      <div className="num" style={{fontSize:'var(--fs-sm)', color:'var(--fg)', minWidth:70, textAlign:'right'}}>{r.rev}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">Activité en direct</div>
                  <span className="badge badge-success"><span className="badge-dot"/>En ligne</span>
                </div>
                <div>
                  {[
                    { when:'Il y a 2 min', who:'Commande #358', what:'a été payée', cat:'ok', amt:'₪150' },
                    { when:'Il y a 5 min', who:'Stock bas', what:'Avocats — 0.63 kg restant', cat:'warn' },
                    { when:'Il y a 8 min', who:'Commande #357', what:'passée en cuisine', cat:'info' },
                    { when:'Il y a 12 min', who:'Avi', what:'a modifié BETTERAVE', cat:'neutral' },
                    { when:'Il y a 15 min', who:'Nouveau client', what:'Sarah Cohen s\'est inscrite', cat:'success' },
                  ].map((e, i) => (
                    <div key={i} style={{padding:'var(--s-3) var(--s-5)', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:'var(--s-3)'}}>
                      <div style={{width:6, height:6, borderRadius:3, background:
                        e.cat==='warn' ? 'var(--warning-500)' :
                        e.cat==='info' ? 'var(--info-500)' :
                        e.cat==='success' ? 'var(--success-500)' :
                        e.cat==='ok' ? 'var(--success-500)' : 'var(--fg-subtle)'}}/>
                      <div style={{flex:1, fontSize:'var(--fs-sm)'}}>
                        <span style={{color:'var(--fg)', fontWeight:500}}>{e.who}</span>{' '}
                        <span className="muted">{e.what}</span>
                      </div>
                      {e.amt && <span className="num muted" style={{fontSize:'var(--fs-xs)'}}>{e.amt}</span>}
                      <span className="subtle" style={{fontSize:'var(--fs-xs)', minWidth:64, textAlign:'right'}}>{e.when}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ trend = 'up' }) {
  const pts = {
    up:   [20, 18, 16, 14, 12, 8, 4],
    down: [4, 8, 10, 12, 14, 16, 18],
    flat: [12, 10, 12, 11, 13, 10, 12],
  }[trend] || [];
  const d = pts.map((y, i) => `${i === 0 ? 'M' : 'L'} ${i * 12} ${y}`).join(' ');
  const color = trend === 'up' ? 'var(--success-500)' : trend === 'down' ? 'var(--danger-500)' : 'var(--fg-subtle)';
  return (
    <svg width="80" height="24" viewBox="0 0 72 24" style={{overflow:'visible'}}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BarChart() {
  const data = [
    { day:'Lun', cur:40, prev:60 },
    { day:'Mar', cur:55, prev:50 },
    { day:'Mer', cur:70, prev:65 },
    { day:'Jeu', cur:62, prev:58 },
    { day:'Ven', cur:85, prev:72 },
    { day:'Sam', cur:95, prev:80 },
    { day:'Dim', cur:78, prev:74 },
  ];
  const max = 100;
  return (
    <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:'var(--s-3)', height: 180}}>
      {data.map((d, i) => (
        <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--s-2)', height:'100%'}}>
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:'100%', width:'100%', justifyContent:'center'}}>
            <div style={{width:12, height:(d.prev/max*100)+'%', background:'var(--surface-3)', borderRadius:'3px 3px 0 0'}}/>
            <div style={{width:12, height:(d.cur/max*100)+'%', background:'var(--brand-500)', borderRadius:'3px 3px 0 0'}}/>
          </div>
          <span style={{fontSize:'var(--fs-xs)', color:'var(--fg-muted)'}}>{d.day}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Dashboard });
