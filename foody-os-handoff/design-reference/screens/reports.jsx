// Reports — NEW screen; editorial analytics view
function Reports({ theme = 'dark' }) {
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="reports" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Rapports', 'Vue d\'ensemble']}/>
          <main className="main">
            <div className="page-head">
              <div>
                <h1 className="page-title">Vue d'ensemble</h1>
                <p className="page-desc">Comparez vos performances · 1er — 23 avril</p>
              </div>
              <div className="hstack">
                <div className="tabs">
                  <button className="tab">7j</button>
                  <button className="tab" aria-selected="true">30j</button>
                  <button className="tab">Trimestre</button>
                  <button className="tab">Année</button>
                </div>
                <button className="btn btn-secondary"><Icon name="calendar" size={14}/> 1 avr — 23 avr</button>
                <button className="btn btn-secondary"><Icon name="save" size={14}/> Exporter</button>
              </div>
            </div>

            {/* Hero metric */}
            <div className="card" style={{padding:'var(--s-8)', marginBottom:'var(--s-5)', display:'grid', gridTemplateColumns:'1fr 320px', gap:'var(--s-8)', alignItems:'center'}}>
              <div>
                <div className="kpi-label" style={{marginBottom:'var(--s-2)'}}>Revenu net · 30 derniers jours</div>
                <div style={{fontSize:56, fontWeight:600, letterSpacing:'-0.03em', lineHeight:1, fontVariantNumeric:'tabular-nums'}}>₪128,440</div>
                <div className="hstack" style={{marginTop:'var(--s-3)'}}>
                  <span className="kpi-delta up"><Icon name="arrowUp" size={14}/> +18.2%</span>
                  <span className="muted" style={{fontSize:'var(--fs-sm)'}}>vs 30j précédents (₪108,650)</span>
                </div>
              </div>
              <div>
                <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none">
                  <path d="M0,80 L20,72 L40,78 L60,60 L80,64 L100,48 L120,52 L140,40 L160,44 L180,30 L200,34 L220,22 L240,28 L260,20 L280,16 L300,22 L320,10 L320,120 L0,120 Z" fill="color-mix(in oklab, var(--brand-500) 20%, transparent)"/>
                  <path d="M0,80 L20,72 L40,78 L60,60 L80,64 L100,48 L120,52 L140,40 L160,44 L180,30 L200,34 L220,22 L240,28 L260,20 L280,16 L300,22 L320,10" fill="none" stroke="var(--brand-500)" strokeWidth="2"/>
                  <path d="M0,92 L40,90 L80,84 L120,80 L160,70 L200,72 L240,60 L280,62 L320,52" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeDasharray="3 3" opacity=".5"/>
                </svg>
              </div>
            </div>

            {/* Secondary KPIs */}
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-5)'}}>
              {[
                { l:'Commandes', v:'1,412', d:'+12.4%', up:true },
                { l:'Ticket moyen', v:'₪91.0', d:'+5.2%', up:true },
                { l:'Coût matière', v:'28.4%', d:'−1.3pp', up:true },
                { l:'Commande moy (temps)', v:'14 min', d:'−2 min', up:true },
              ].map((k, i) => (
                <div className="kpi" key={i}>
                  <div className="kpi-label">{k.l}</div>
                  <div className="kpi-value">{k.v}</div>
                  <span className={`kpi-delta ${k.up ? 'up' : 'down'}`}><Icon name={k.up ? 'arrowUp':'arrowDown'} size={12}/>{k.d}</span>
                </div>
              ))}
            </div>

            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'var(--s-5)'}}>
              <div className="card">
                <div className="card-header"><div className="card-title">Revenu par jour · comparaison semaine</div></div>
                <div style={{padding:'var(--s-5)'}}>
                  <svg viewBox="0 0 600 240" width="100%" height="240">
                    {[0,1,2,3,4].map(i => <line key={i} x1="0" y1={40+i*40} x2="600" y2={40+i*40} stroke="var(--line)" strokeDasharray="2 4"/>)}
                    {/* Prev */}
                    <path d="M30,180 L120,160 L210,130 L300,150 L390,110 L480,95 L570,120" stroke="var(--fg-subtle)" strokeWidth="2" fill="none" opacity=".5"/>
                    {/* Current */}
                    <path d="M30,150 L120,130 L210,85 L300,100 L390,60 L480,40 L570,75" stroke="var(--brand-500)" strokeWidth="2.5" fill="none"/>
                    {[[30,150],[120,130],[210,85],[300,100],[390,60],[480,40],[570,75]].map(([x,y],i)=>
                      <circle key={i} cx={x} cy={y} r="4" fill="var(--brand-500)" stroke="var(--surface)" strokeWidth="2"/>
                    )}
                    {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d,i)=>
                      <text key={d} x={30+i*90} y="228" fontSize="11" fill="var(--fg-muted)" textAnchor="middle">{d}</text>
                    )}
                  </svg>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Mix par catégorie</div></div>
                <div style={{padding:'var(--s-5)'}}>
                  {[
                    { c:'Salades', v:42, col:'cat-1' },
                    { c:'Pâtisseries', v:22, col:'cat-2' },
                    { c:'Viande', v:16, col:'cat-6' },
                    { c:'Essentials', v:12, col:'cat-5' },
                    { c:'Poissons', v:8, col:'cat-4' },
                  ].map((r, i) => (
                    <div key={i} style={{marginBottom:'var(--s-3)'}}>
                      <div className="hstack" style={{justifyContent:'space-between', marginBottom:4}}>
                        <span style={{fontSize:'var(--fs-sm)'}}>{r.c}</span>
                        <span className="num" style={{fontSize:'var(--fs-sm)'}}>{r.v}%</span>
                      </div>
                      <div style={{height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden'}}>
                        <div style={{width:r.v+'%', height:'100%', background:`var(--${r.col})`}}/>
                      </div>
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

Object.assign(window, { Reports });
