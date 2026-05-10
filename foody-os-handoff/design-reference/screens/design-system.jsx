// Design System doc + UX Audit content (single page, split sections)
function DesignSystem({ theme = 'dark' }) {
  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', overflow:'auto', background:'var(--bg)', color:'var(--fg)'}}>
      <div style={{maxWidth:1160, margin:'0 auto', padding:'var(--s-12) var(--s-8)'}}>
        <div style={{marginBottom:'var(--s-10)'}}>
          <div className="badge badge-brand" style={{marginBottom:'var(--s-3)'}}>v1.0 · Foody OS</div>
          <h1 style={{fontSize:48, fontWeight:600, letterSpacing:'-0.03em', lineHeight:1.05, margin:0}}>Le système de design</h1>
          <p className="muted" style={{fontSize:'var(--fs-lg)', maxWidth:640, marginTop:'var(--s-3)'}}>Un langage visuel unifié pour toutes les pages de Foody Admin — tokens, composants et patterns, en clair et sombre.</p>
        </div>

        {/* Colors */}
        <Section title="Couleurs" num="01">
          <div style={{marginBottom:'var(--s-5)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Marque</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(9, 1fr)', gap:'var(--s-2)'}}>
              {['#fff7ed','#ffedd5','#fed7aa','#fdba74','#fb923c','#f97316','#ea580c','#c2410c','#9a3412'].map((c,i) => (
                <div key={c}>
                  <div style={{height:56, background:c, borderRadius:'var(--r-md)', border:'1px solid var(--line)'}}/>
                  <div style={{fontSize:'var(--fs-xs)', marginTop:4}}>brand-{[50,100,200,300,400,500,600,700,800][i]}</div>
                  <div className="subtle mono" style={{fontSize:10}}>{c}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginBottom:'var(--s-5)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Sémantique</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-3)'}}>
              {[['Succès','--success-500','#16a34a'],['Attention','--warning-500','#d97706'],['Danger','--danger-500','#dc2626'],['Info','--info-500','#2563eb']].map(([n,v,h]) => (
                <div key={n} className="card" style={{padding:'var(--s-4)'}}>
                  <div style={{width:'100%', height:40, background:h, borderRadius:'var(--r-sm)'}}/>
                  <div style={{fontSize:'var(--fs-sm)', fontWeight:500, marginTop:8}}>{n}</div>
                  <div className="subtle mono" style={{fontSize:10}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Catégoriel · 8 teintes</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:'var(--s-2)'}}>
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i}>
                  <div style={{height:56, background:`var(--cat-${i})`, borderRadius:'var(--r-md)'}}/>
                  <div style={{fontSize:'var(--fs-xs)', marginTop:4}}>cat-{i}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typographie" num="02">
          <p className="muted" style={{marginBottom:'var(--s-5)'}}>Geist pour l'UI, Geist Mono pour les nombres, monnaie et codes. Chargés via Google Fonts.</p>
          <div className="card" style={{padding:'var(--s-6)'}}>
            <div style={{fontSize:48, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1}}>Aa 0123456789 ₪€</div>
            <div className="vstack" style={{marginTop:'var(--s-5)', gap:'var(--s-3)'}}>
              {[
                ['Display / 48', 48, 600, -0.03],
                ['Title / 28', 28, 600, -0.02],
                ['Heading / 22', 22, 600, -0.01],
                ['Body / 14', 14, 400, 0],
                ['Small / 13', 13, 400, 0],
                ['Caption / 12', 12, 500, 0],
                ['Micro / 11', 11, 600, 0.06],
              ].map(([n, s, w, l]) => (
                <div key={n} className="hstack" style={{justifyContent:'space-between', borderBottom:'1px solid var(--line)', paddingBottom:'var(--s-3)'}}>
                  <div style={{fontSize:s, fontWeight:w, letterSpacing:l+'em'}}>Mamie Tlv · Ordering made fast</div>
                  <div className="subtle mono" style={{fontSize:11}}>{n} · w{w}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Spacing */}
        <Section title="Espace & Radii" num="03">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--s-5)'}}>
            <div className="card" style={{padding:'var(--s-5)'}}>
              <div style={{fontWeight:600, marginBottom:'var(--s-3)'}}>Échelle (4pt)</div>
              <div className="vstack" style={{gap:'var(--s-2)'}}>
                {[['s-1',4],['s-2',8],['s-3',12],['s-4',16],['s-5',20],['s-6',24],['s-8',32],['s-10',40],['s-12',48]].map(([n,v]) => (
                  <div key={n} className="hstack">
                    <div className="mono subtle" style={{width:60, fontSize:'var(--fs-xs)'}}>{n}</div>
                    <div style={{width:v, height:20, background:'var(--brand-500)', borderRadius:2}}/>
                    <div className="mono subtle" style={{fontSize:'var(--fs-xs)'}}>{v}px</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:'var(--s-5)'}}>
              <div style={{fontWeight:600, marginBottom:'var(--s-3)'}}>Radii</div>
              <div className="vstack" style={{gap:'var(--s-3)'}}>
                {[['xs',4,'badges, dots'],['sm',6,'chips'],['md',10,'inputs, buttons'],['lg',14,'cards'],['xl',18,'modals, drawers']].map(([n, v, use]) => (
                  <div key={n} className="hstack">
                    <div style={{width:40, height:40, borderRadius:v, background:'var(--surface-2)', border:'1px solid var(--line)'}}/>
                    <div style={{flex:1}}>
                      <div className="mono" style={{fontSize:'var(--fs-sm)'}}>r-{n} · {v}px</div>
                      <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{use}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Components */}
        <Section title="Composants" num="04">
          <div className="card" style={{padding:'var(--s-6)', marginBottom:'var(--s-4)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Boutons</div>
            <div className="hstack" style={{flexWrap:'wrap', gap:'var(--s-3)'}}>
              <button className="btn btn-primary">Enregistrer</button>
              <button className="btn btn-secondary">Annuler</button>
              <button className="btn btn-ghost">Parcourir</button>
              <button className="btn btn-danger">Supprimer</button>
              <button className="btn btn-primary btn-sm">Small</button>
              <button className="btn btn-primary btn-lg">Large</button>
              <button className="btn btn-secondary btn-icon"><Icon name="edit"/></button>
            </div>
          </div>

          <div className="card" style={{padding:'var(--s-6)', marginBottom:'var(--s-4)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Badges & statuts</div>
            <div className="hstack" style={{flexWrap:'wrap'}}>
              <span className="badge badge-neutral">Neutre</span>
              <span className="badge badge-success"><span className="badge-dot"/>Servie</span>
              <span className="badge badge-warning"><span className="badge-dot"/>En cuisine</span>
              <span className="badge badge-info"><span className="badge-dot"/>Acceptée</span>
              <span className="badge badge-danger"><span className="badge-dot"/>Rejetée</span>
              <span className="badge badge-brand">Top</span>
            </div>
          </div>

          <div className="card" style={{padding:'var(--s-6)', marginBottom:'var(--s-4)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Inputs</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'var(--s-3)', maxWidth:720}}>
              <input className="input" placeholder="Champ texte"/>
              <div className="input-group"><Icon name="search" size={14}/><input placeholder="Rechercher"/></div>
              <select className="select"><option>Sélection</option></select>
            </div>
          </div>

          <div className="card" style={{padding:'var(--s-6)'}}>
            <div className="subtle" style={{textTransform:'uppercase', fontSize:'var(--fs-xs)', letterSpacing:'.08em', fontWeight:600, marginBottom:'var(--s-3)'}}>Chips & tabs</div>
            <div className="hstack" style={{flexWrap:'wrap', marginBottom:'var(--s-3)'}}>
              <button className="chip" aria-pressed="true">Actif</button>
              <button className="chip">Inactif</button>
              <button className="chip">Filtre · Tous</button>
            </div>
            <div className="tabs"><button className="tab" aria-selected="true">Onglet 1</button><button className="tab">Onglet 2</button><button className="tab">Onglet 3</button></div>
          </div>
        </Section>

        {/* Principles */}
        <Section title="Principes" num="05">
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'var(--s-4)'}}>
            {[
              ['Uniforme', 'Une seule manière de faire chaque chose. Tout le produit partage les mêmes tokens, espacements, et statuts.'],
              ['Lisible en service', 'Typographie tabulaire pour les nombres, statuts colorés avec points, cibles tactiles ≥ 36px.'],
              ['Calme puis vif', 'Neutres chauds par défaut. L\'orange ne s\'utilise que sur les actions primaires et les états actifs.'],
              ['Bi-directionnel', 'Chaque composant supporte LTR et RTL nativement. Testé en hébreu.'],
              ['Respecte le contexte', 'Deux thèmes équivalents. Jamais une couleur codée en dur.'],
              ['Données d\'abord', 'Contenus avant décoration. Jamais d\'icônes décoratives, jamais de stat inutile.'],
            ].map(([t, d]) => (
              <div key={t} className="card" style={{padding:'var(--s-5)'}}>
                <div style={{fontWeight:600, marginBottom:'var(--s-2)'}}>{t}</div>
                <div className="muted" style={{fontSize:'var(--fs-sm)'}}>{d}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ num, title, children }) {
  return (
    <section style={{marginBottom:'var(--s-12)', paddingBottom:'var(--s-8)', borderBottom:'1px solid var(--line)'}}>
      <div className="hstack" style={{marginBottom:'var(--s-5)'}}>
        <span className="mono subtle" style={{fontSize:'var(--fs-sm)'}}>{num}</span>
        <h2 style={{fontSize:'var(--fs-2xl)', fontWeight:600, letterSpacing:'-0.01em', margin:0}}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

Object.assign(window, { DesignSystem });
