// Modifier l'article en stock — FULL-SCREEN EDITOR
// Matches the Item Editor visual pattern: inset overlay, 60px head, left rail + main content.

function StockItemEditor({ theme = 'dark' }) {
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', position:'relative', background:'var(--bg)', color:'var(--fg)', overflow:'hidden'}}>
      {/* Dimmed app chrome behind */}
      <div style={{filter:'blur(2px)', opacity:.5, pointerEvents:'none', height:'100%'}}>
        <div className="app">
          <Sidebar active="kitchen.stock" theme={theme}/>
          <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
            <Topbar crumbs={['Cuisine','Stock']}/>
            <main className="main"/>
          </div>
        </div>
      </div>

      <FullScreenEditor
        title="Modifier l'article en stock"
        subtitle="Dernière modification par Omer · il y a 4 min"
        status={<span className="badge badge-neutral" style={{marginRight:8}}><Icon name="check" size={12}/> Enregistré</span>}
        onClose={() => {}}
        onSave={() => {}}
        rail={<StockRail/>}
      >
        <StockMain/>
      </FullScreenEditor>
    </div>
  );
}

function StockRail() {
  return (
    <>
      {/* Avocado image */}
      <div style={{position:'relative'}}>
        <div style={{
          width:'100%', aspectRatio:'1', borderRadius:'var(--r-lg)',
          background:'radial-gradient(circle at 40% 40%, #7c9450, #3c4f28 60%, #1f2a12)',
          display:'grid', placeItems:'center', position:'relative', overflow:'hidden',
        }}>
          <div style={{width:'55%', aspectRatio:'1', background:'#5a3c1e', borderRadius:'50%', boxShadow:'inset 4px 4px 10px rgba(0,0,0,.4)'}}/>
        </div>
        <button style={{position:'absolute', bottom:8, right:8, width:32, height:32, borderRadius:8, background:'rgba(0,0,0,.6)', border:'none', color:'#fff', display:'grid', placeItems:'center'}}>
          <Icon name="edit" size={14}/>
        </button>
        <span className="badge badge-success" style={{position:'absolute', top:8, left:8}}><span className="badge-dot"/>Actif</span>
      </div>

      <div style={{marginTop:'var(--s-4)'}}>
        <div style={{fontSize:'var(--fs-xl)', fontWeight:600, letterSpacing:'-0.01em'}}>Avocats</div>
        <div className="hstack" style={{marginTop:6}}>
          <span className="num" style={{color:'var(--brand-500)', fontWeight:600}}>₪14.90</span>
          <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>/ kg</span>
          <span className="badge badge-neutral" style={{marginLeft:'auto'}}>FRUITS</span>
        </div>
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>État du stock</div>
      <div className="vstack" style={{gap:'var(--s-2)'}}>
        <div className="hstack" style={{justifyContent:'space-between'}}>
          <span className="muted" style={{fontSize:'var(--fs-sm)'}}>Quantité</span>
          <span className="num" style={{fontSize:'var(--fs-sm)'}}>0.63 kg</span>
        </div>
        <div className="hstack" style={{justifyContent:'space-between'}}>
          <span className="muted" style={{fontSize:'var(--fs-sm)'}}>Valeur</span>
          <span className="num" style={{fontSize:'var(--fs-sm)'}}>₪9.31</span>
        </div>
        <div className="hstack" style={{justifyContent:'space-between'}}>
          <span className="muted" style={{fontSize:'var(--fs-sm)'}}>Niveau</span>
          <span className="badge badge-warning" style={{fontSize:'var(--fs-xs)'}}><Icon name="warn" size={10}/>Bas</span>
        </div>
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, color:'var(--fg-subtle)', marginBottom:'var(--s-3)'}}>Utilisation</div>
      <div className="vstack" style={{gap:6, fontSize:'var(--fs-sm)'}}>
        {["L'OR ROUGE", "GUACAMOLE", "SALADE D'AVOCAT"].map(n => (
          <div key={n} className="hstack" style={{justifyContent:'space-between', padding:'6px 10px', background:'var(--surface-2)', borderRadius:'var(--r-sm)'}}>
            <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{n}</span>
            <Icon name="chevronRight" size={12}/>
          </div>
        ))}
      </div>

      <div className="divider" style={{margin:'var(--s-4) 0'}}/>

      <div className="vstack" style={{gap:'var(--s-2)'}}>
        <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start'}}><Icon name="layers" size={14}/> Dupliquer</button>
        <button className="btn btn-ghost btn-sm" style={{justifyContent:'flex-start', color:'var(--danger-500)'}}><Icon name="trash" size={14}/> Archiver</button>
      </div>
    </>
  );
}

function StockMain() {
  return (
    <div style={{maxWidth:780}}>
      {/* Section header with brand accent bar (matches Item editor tabs style) */}
      <div style={{fontSize:'var(--fs-xl)', fontWeight:600, marginBottom:'var(--s-5)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:3, height:20, background:'var(--brand-500)', borderRadius:2}}/> Identité & achat
      </div>

      {/* Name */}
      <Section title="Nom de l'article">
        <div className="input-group" style={{height:44, borderColor:'var(--brand-500)', boxShadow:'var(--focus-ring)'}}>
          <input defaultValue="Avocats" style={{fontSize:'var(--fs-md)', fontWeight:500}}/>
        </div>
      </Section>

      {/* Category + reference row */}
      <Section title="Classification">
        <div className="hstack" style={{gap:'var(--s-3)'}}>
          <Field label="Catégorie" grow>
            <select className="input"><option>Fruits</option><option>Légumes</option><option>Viande</option></select>
          </Field>
          <Field label="Référence / code-barres" grow>
            <input className="input mono" placeholder="Réf. fournisseur"/>
          </Field>
          <Field label="Fournisseur par défaut" grow>
            <select className="input"><option>Halperin & Fils</option><option>Shouk HaTikva</option><option>Pas de fournisseur</option></select>
          </Field>
        </div>
      </Section>

      {/* Purchase */}
      <Section title="Achat & prix" desc="Quantité achetée et prix unitaire de la dernière facture.">
        <div className="hstack" style={{gap:'var(--s-3)', marginBottom:'var(--s-4)'}}>
          <Field label="Quantité achetée" grow>
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <input className="input num" defaultValue="0,6" style={{width:120, textAlign:'right'}}/>
              <select className="input" style={{width:120}}>
                <option>kg</option><option>g</option><option>l</option><option>unité</option>
              </select>
            </div>
          </Field>
          <Field label="Prix au kg" grow>
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <input className="input num" defaultValue="14,896" style={{width:140, textAlign:'right'}}/>
              <span className="mono subtle" style={{fontSize:'var(--fs-sm)'}}>₪ HT</span>
            </div>
          </Field>
          <Field label="TVA" grow>
            <select className="input"><option>0% (exonéré)</option><option>18%</option></select>
          </Field>
        </div>

        <div style={{
          padding:'var(--s-3) var(--s-4)',
          background:'var(--surface-2)', borderRadius:'var(--r-md)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span className="subtle" style={{fontSize:'var(--fs-xs)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600}}>Total cette ligne</span>
          <div className="hstack" style={{gap:'var(--s-4)'}}>
            <div><span className="num" style={{fontSize:'var(--fs-lg)', fontWeight:600}}>9.31 ₪</span> <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>HT</span></div>
            <div className="subtle">·</div>
            <div><span className="num" style={{fontSize:'var(--fs-lg)', fontWeight:600}}>9.31 ₪</span> <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>TTC</span></div>
          </div>
        </div>
      </Section>

      {/* Recent purchases */}
      <Section title="Achats récents" desc="3 derniers prix payés chez vos fournisseurs — détecte les hausses.">
        <div>
          {[
            { when:'22 avril', sup:'Halperin & Fils', qty:'1.2 kg', price:'14.50 ₪', trend:'same' },
            { when:'15 avril', sup:'Halperin & Fils', qty:'0.8 kg', price:'13.90 ₪', trend:'down' },
            { when:'8 avril',  sup:'Shouk HaTikva',   qty:'1.0 kg', price:'15.20 ₪', trend:'up' },
          ].map((r, i) => (
            <div key={i} style={{display:'grid', gridTemplateColumns:'90px 1fr 90px 120px 24px', gap:'var(--s-3)', padding:'var(--s-3) 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', alignItems:'center', fontSize:'var(--fs-sm)'}}>
              <span className="subtle">{r.when}</span>
              <span>{r.sup}</span>
              <span className="num subtle" style={{textAlign:'right'}}>{r.qty}</span>
              <span className="num" style={{textAlign:'right', fontWeight:500}}>{r.price}</span>
              <span style={{color: r.trend === 'up' ? 'var(--warning-500)' : r.trend === 'down' ? 'var(--success-500)' : 'var(--fg-subtle)'}}>
                <Icon name={r.trend === 'up' ? 'arrowUp' : r.trend === 'down' ? 'arrowDown' : 'check'} size={12}/>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Invoice names — with RTL example */}
      <Section title="Noms sur la facture" desc="Noms sous lesquels cet article apparaît sur les factures de vos fournisseurs. Appris automatiquement lors des imports et modifiable ici.">
        <div className="vstack" style={{gap:'var(--s-2)'}}>
          <div className="hstack" style={{gap:'var(--s-2)'}}>
            <div className="input-group" style={{flex:1}}>
              <input defaultValue="אבוקדו" dir="rtl" style={{textAlign:'right'}}/>
            </div>
            <select className="input" style={{width:160}}>
              <option>Tous fournisseurs</option>
              <option>Halperin & Fils</option>
            </select>
            <button className="btn btn-ghost btn-icon"><Icon name="trash" size={14}/></button>
          </div>
          <div className="hstack" style={{gap:'var(--s-2)'}}>
            <div className="input-group" style={{flex:1}}>
              <input defaultValue="AVOCAT EXTRA"/>
            </div>
            <select className="input" style={{width:160}}>
              <option>Shouk HaTikva</option>
            </select>
            <button className="btn btn-ghost btn-icon"><Icon name="trash" size={14}/></button>
          </div>
          <button className="btn btn-secondary btn-sm" style={{alignSelf:'flex-start'}}>
            <Icon name="plus" size={12}/> Ajouter un nom
          </button>
        </div>
      </Section>
    </div>
  );
}

Object.assign(window, { StockItemEditor });
