// Paramètres — settings shell + 6 sub-pages
// Reusable layout: left nav rail inside the main area, right = content

function SettingsShell({ theme = 'dark', active = 'general', children }) {
  const sections = [
    { group:'Compte', items: [
      { id:'general',  label:'Général',        icon:'settings' },
      { id:'branding', label:'Image de marque', icon:'tag' },
      { id:'hours',    label:'Horaires',       icon:'clock' },
    ]},
    { group:'Commerce', items: [
      { id:'payments', label:'Paiements & TVA', icon:'dollar' },
      { id:'printers', label:'Imprimantes & KDS', icon:'fire' },
    ]},
    { group:'Organisation', items: [
      { id:'team',     label:'Équipe & rôles',  icon:'users' },
    ]},
  ];

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', background:'var(--bg)', color:'var(--fg)'}}>
      <div className="app">
        <Sidebar active="settings" theme={theme}/>
        <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
          <Topbar crumbs={['Paramètres', sections.flatMap(s => s.items).find(i => i.id === active)?.label || 'Général']}/>
          <main className="main" style={{padding:0, display:'grid', gridTemplateColumns:'260px 1fr', minHeight:0, flex:1}}>
            {/* Settings nav rail */}
            <aside style={{
              borderRight:'1px solid var(--line)',
              padding:'var(--s-5) var(--s-4)',
              background:'var(--surface)',
              overflow:'auto',
            }}>
              <div style={{
                fontSize:'var(--fs-xs)', fontWeight:600,
                textTransform:'uppercase', letterSpacing:'.08em',
                color:'var(--fg-muted)', marginBottom:'var(--s-4)',
              }}>Paramètres</div>
              {sections.map(s => (
                <div key={s.group} style={{marginBottom:'var(--s-4)'}}>
                  <div style={{fontSize:11, color:'var(--fg-subtle)', fontWeight:600, padding:'var(--s-2) var(--s-3)', textTransform:'uppercase', letterSpacing:'.06em'}}>{s.group}</div>
                  {s.items.map(it => (
                    <div key={it.id} className={`nav-item ${active === it.id ? 'active' : ''}`} style={{
                      color: active === it.id ? 'var(--fg)' : 'var(--fg-muted)',
                      background: active === it.id ? 'color-mix(in oklab, var(--brand-500) 10%, transparent)' : 'transparent',
                    }}>
                      <Icon name={it.icon} size={16}/>
                      <span>{it.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </aside>

            {/* Content area */}
            <div style={{overflow:'auto', padding:'var(--s-6)'}}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------- Individual settings pages ----------

function SettingsGeneral({ theme }) {
  return (
    <SettingsShell theme={theme} active="general">
      <div style={{maxWidth:880}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Général</h1>
            <p className="page-desc">Informations de base de votre restaurant et préférences système.</p>
          </div>
        </div>

        <Section title="Informations du restaurant" desc="Affichées sur les tickets, factures, et le site de commande en ligne.">
          <div className="vstack" style={{gap:'var(--s-4)'}}>
            <div className="hstack" style={{gap:'var(--s-4)'}}>
              <Field label="Nom" grow>
                <input className="input" defaultValue="Mamie Tlv"/>
              </Field>
              <Field label="Nom légal" grow>
                <input className="input" defaultValue="Mamie Food Ltd."/>
              </Field>
            </div>
            <Field label="Adresse">
              <input className="input" defaultValue="12 Rue Dizengoff, Tel Aviv 6433209"/>
            </Field>
            <div className="hstack" style={{gap:'var(--s-4)'}}>
              <Field label="Téléphone" grow>
                <input className="input mono" defaultValue="+972 3 123 4567"/>
              </Field>
              <Field label="Email" grow>
                <input className="input" type="email" defaultValue="contact@mamie.tlv"/>
              </Field>
            </div>
            <div className="hstack" style={{gap:'var(--s-4)'}}>
              <Field label="Numéro SIRET / Tax ID" grow>
                <input className="input mono" defaultValue="51-1234567"/>
              </Field>
              <Field label="Capacité (couverts)" grow>
                <input className="input num" defaultValue="48"/>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Préférences" desc="Langue, fuseau horaire, devise et format des chiffres.">
          <div className="hstack" style={{gap:'var(--s-4)', flexWrap:'wrap'}}>
            <Field label="Langue" grow>
              <select className="input"><option>Français</option><option>English</option><option>עברית</option></select>
            </Field>
            <Field label="Fuseau horaire" grow>
              <select className="input"><option>Asia/Jerusalem (GMT+3)</option></select>
            </Field>
            <Field label="Devise" grow>
              <select className="input"><option>Shekel (₪)</option><option>Euro (€)</option><option>US Dollar ($)</option></select>
            </Field>
            <Field label="Format numérique" grow>
              <select className="input"><option>1 234,56</option><option>1,234.56</option></select>
            </Field>
          </div>
        </Section>

        <Section title="Zone dangereuse" desc="Actions irréversibles. Contactez le support en cas de doute.">
          <div className="vstack" style={{gap:'var(--s-2)'}}>
            <div className="hstack" style={{justifyContent:'space-between', padding:'var(--s-4)', background:'color-mix(in oklab, var(--danger-500) 6%, var(--surface))', border:'1px solid color-mix(in oklab, var(--danger-500) 25%, var(--line))', borderRadius:'var(--r-md)'}}>
              <div>
                <div style={{fontWeight:600, fontSize:'var(--fs-sm)'}}>Exporter toutes les données</div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Archive complète (commandes, articles, clients) au format CSV.</div>
              </div>
              <button className="btn btn-secondary btn-sm">Exporter</button>
            </div>
            <div className="hstack" style={{justifyContent:'space-between', padding:'var(--s-4)', background:'color-mix(in oklab, var(--danger-500) 10%, var(--surface))', border:'1px solid color-mix(in oklab, var(--danger-500) 35%, var(--line))', borderRadius:'var(--r-md)'}}>
              <div>
                <div style={{fontWeight:600, fontSize:'var(--fs-sm)', color:'var(--danger-500)'}}>Fermer définitivement ce compte</div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Toutes les données seront supprimées après 30 jours.</div>
              </div>
              <button className="btn btn-secondary btn-sm" style={{color:'var(--danger-500)', borderColor:'color-mix(in oklab, var(--danger-500) 40%, var(--line))'}}>Fermer le compte</button>
            </div>
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

function SettingsBranding({ theme }) {
  return (
    <SettingsShell theme={theme} active="branding">
      <div style={{maxWidth:880}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Image de marque</h1>
            <p className="page-desc">Logo, couleurs, et apparence de vos supports clients.</p>
          </div>
          <button className="btn btn-primary"><Icon name="save" size={14}/> Enregistrer</button>
        </div>

        <Section title="Logo et identité">
          <div style={{display:'grid', gridTemplateColumns:'200px 1fr', gap:'var(--s-5)'}}>
            <div style={{
              aspectRatio:'1', borderRadius:'var(--r-lg)',
              background:'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
              display:'grid', placeItems:'center', color:'#fff',
              fontSize:72, fontWeight:700, letterSpacing:'-0.04em',
              fontFamily:'var(--font-serif)',
            }}>M</div>
            <div className="vstack" style={{gap:'var(--s-3)'}}>
              <div className="hstack">
                <button className="btn btn-secondary btn-sm"><Icon name="edit" size={12}/> Changer le logo</button>
                <button className="btn btn-ghost btn-sm" style={{color:'var(--fg-muted)'}}>Supprimer</button>
              </div>
              <Field label="Slogan" hint="Affiché sur la page d'accueil de votre menu en ligne.">
                <input className="input" defaultValue="La cuisine de grand-mère, au cœur de Tel Aviv."/>
              </Field>
              <Field label="Slogan court" hint="Pour les reçus (40 car. max).">
                <input className="input" defaultValue="Cuisine maison · depuis 2019" maxLength={40}/>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Couleurs" desc="Appliquées à votre menu en ligne et aux emails clients.">
          <div className="hstack" style={{gap:'var(--s-3)', flexWrap:'wrap'}}>
            {[
              { name:'Primaire', val:'#f97316' },
              { name:'Accent', val:'#fb923c' },
              { name:'Fond', val:'#0a0a0b' },
              { name:'Texte', val:'#ededef' },
            ].map(c => (
              <div key={c.name} style={{
                flex:'1 1 200px', padding:'var(--s-3)',
                background:'var(--surface)', border:'1px solid var(--line)',
                borderRadius:'var(--r-md)',
                display:'flex', alignItems:'center', gap:'var(--s-3)',
              }}>
                <div style={{width:44, height:44, borderRadius:'var(--r-sm)', background:c.val, border:'1px solid var(--line)'}}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:'var(--fs-xs)', color:'var(--fg-muted)', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em'}}>{c.name}</div>
                  <div className="mono" style={{fontSize:'var(--fs-sm)'}}>{c.val.toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typographie">
          <div className="hstack" style={{gap:'var(--s-4)'}}>
            <Field label="Police titres" grow>
              <select className="input" style={{fontFamily:'var(--font-serif)'}}><option>Instrument Serif (actuel)</option><option>Geist</option><option>Playfair Display</option></select>
            </Field>
            <Field label="Police corps" grow>
              <select className="input"><option>Geist (actuel)</option><option>Inter</option><option>System UI</option></select>
            </Field>
          </div>
          <div style={{marginTop:'var(--s-4)', padding:'var(--s-5)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)'}}>
            <div style={{fontFamily:'var(--font-serif)', fontSize:40, letterSpacing:'-0.02em', marginBottom:8}}>Aperçu du style</div>
            <div className="subtle" style={{fontSize:'var(--fs-sm)', lineHeight:1.6}}>Voici à quoi ressembleront vos titres et votre texte sur votre menu en ligne et vos emails clients.</div>
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

function SettingsHours({ theme }) {
  const days = [
    { d:'Lundi',    open:'12:00', close:'23:00', closed:false },
    { d:'Mardi',    open:'12:00', close:'23:00', closed:false },
    { d:'Mercredi', open:'12:00', close:'23:00', closed:false },
    { d:'Jeudi',    open:'12:00', close:'00:00', closed:false },
    { d:'Vendredi', open:'12:00', close:'15:00', closed:false },
    { d:'Samedi',   open:'—',     close:'—',     closed:true  },
    { d:'Dimanche', open:'18:00', close:'23:00', closed:false },
  ];
  return (
    <SettingsShell theme={theme} active="hours">
      <div style={{maxWidth:880}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Horaires</h1>
            <p className="page-desc">Affichés sur votre menu en ligne. Les commandes sont bloquées en dehors de ces horaires.</p>
          </div>
          <span className="badge badge-success"><span className="badge-dot"/>Ouvert maintenant</span>
        </div>

        <Section title="Heures d'ouverture">
          <div style={{border:'1px solid var(--line)', borderRadius:'var(--r-md)', overflow:'hidden'}}>
            {days.map((day, i) => (
              <div key={day.d} style={{
                display:'grid', gridTemplateColumns:'140px 1fr 220px 80px',
                gap:'var(--s-4)', padding:'var(--s-3) var(--s-4)',
                alignItems:'center',
                borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                background: day.closed ? 'var(--surface-2)' : 'transparent',
              }}>
                <div style={{fontWeight:500, fontSize:'var(--fs-sm)', color: day.closed ? 'var(--fg-muted)' : 'var(--fg)'}}>{day.d}</div>
                <div>
                  {day.closed ? (
                    <span className="subtle" style={{fontSize:'var(--fs-sm)', fontStyle:'italic'}}>Fermé (Shabbat)</span>
                  ) : (
                    <div className="hstack" style={{gap:'var(--s-2)'}}>
                      <input className="input mono" defaultValue={day.open} style={{width:100, textAlign:'center'}}/>
                      <span className="subtle">—</span>
                      <input className="input mono" defaultValue={day.close} style={{width:100, textAlign:'center'}}/>
                    </div>
                  )}
                </div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>
                  {day.closed ? '' : 'Last order —30 min'}
                </div>
                <label className="hstack" style={{gap:6, fontSize:'var(--fs-xs)', color:'var(--fg-muted)', justifyContent:'flex-end'}}>
                  <input type="checkbox" defaultChecked={day.closed}/>
                  Fermé
                </label>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Fermetures exceptionnelles">
          <div className="vstack" style={{gap:'var(--s-2)'}}>
            {[
              { d:'15–22 avril', r:'Pessah — restaurant fermé' },
              { d:'28 sept', r:'Rosh Hashana — service du soir uniquement' },
              { d:'7 oct',  r:'Yom Kippour — fermé' },
            ].map((ex, i) => (
              <div key={i} className="hstack" style={{justifyContent:'space-between', padding:'var(--s-3) var(--s-4)', background:'var(--surface-2)', borderRadius:'var(--r-sm)'}}>
                <div className="hstack">
                  <Icon name="calendar" size={14}/>
                  <div>
                    <div style={{fontSize:'var(--fs-sm)', fontWeight:500}}>{ex.d}</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{ex.r}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="trash" size={14}/></button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" style={{alignSelf:'flex-start'}}>
              <Icon name="plus" size={12}/> Ajouter une fermeture
            </button>
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

function SettingsPayments({ theme }) {
  return (
    <SettingsShell theme={theme} active="payments">
      <div style={{maxWidth:880}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Paiements & TVA</h1>
            <p className="page-desc">Méthodes de paiement acceptées et taux de TVA.</p>
          </div>
        </div>

        <Section title="Méthodes de paiement">
          <div className="vstack" style={{gap:'var(--s-2)'}}>
            {[
              { n:'Espèces', d:'Toujours disponible', on:true, icon:'dollar' },
              { n:'Carte bancaire (Clover)', d:'Connecté · ****4892', on:true, icon:'tag' },
              { n:'Bit (paiement mobile)', d:'Connecté · +972 3 123 4567', on:true, icon:'tag' },
              { n:'Apple Pay / Google Pay', d:'Via Clover', on:true, icon:'tag' },
              { n:'Tickets restaurant Cibus', d:'Compte non connecté', on:false, icon:'tag' },
            ].map((m, i) => (
              <div key={i} className="hstack" style={{justifyContent:'space-between', padding:'var(--s-4)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)'}}>
                <div className="hstack">
                  <div style={{width:40, height:40, borderRadius:'var(--r-sm)', background:'var(--surface-2)', display:'grid', placeItems:'center', color: m.on ? 'var(--brand-500)' : 'var(--fg-subtle)'}}>
                    <Icon name={m.icon} size={18}/>
                  </div>
                  <div>
                    <div style={{fontWeight:500, fontSize:'var(--fs-sm)'}}>{m.n}</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{m.d}</div>
                  </div>
                </div>
                <div className="hstack">
                  {m.on ? (
                    <>
                      <span className="badge badge-success"><span className="badge-dot"/>Actif</span>
                      <button className="btn btn-ghost btn-sm">Configurer</button>
                    </>
                  ) : (
                    <button className="btn btn-secondary btn-sm">Connecter</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Taux de TVA" desc="Les taux sont appliqués automatiquement selon la catégorie de l'article.">
          <div style={{border:'1px solid var(--line)', borderRadius:'var(--r-md)', overflow:'hidden'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 120px 120px 32px', gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)', background:'var(--surface-2)', fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'.06em'}}>
              <span>Nom</span>
              <span style={{textAlign:'right'}}>Taux</span>
              <span style={{textAlign:'right'}}>Par défaut</span>
              <span/>
            </div>
            {[
              { n:'Standard', r:'18%', d:false },
              { n:'Réduit (livres, journaux)', r:'0%', d:false },
              { n:'Exonéré (exports, ingrédients bruts)', r:'0%', d:true },
            ].map((t, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 120px 120px 32px', gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)', alignItems:'center', borderTop:'1px solid var(--line)', fontSize:'var(--fs-sm)'}}>
                <span style={{fontWeight:500}}>{t.n}</span>
                <span className="num" style={{textAlign:'right'}}>{t.r}</span>
                <span style={{textAlign:'right'}}>{t.d && <span className="badge badge-info">Défaut</span>}</span>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Arrondi et pourboire">
          <div className="hstack" style={{gap:'var(--s-4)'}}>
            <Field label="Arrondi sur total" grow>
              <select className="input"><option>Aucun (au centime près)</option><option>10 agorot</option><option>Shekel entier</option></select>
            </Field>
            <Field label="Pourboire suggéré" grow>
              <div className="hstack" style={{gap:'var(--s-2)'}}>
                <input className="input num" defaultValue="10" style={{width:60, textAlign:'right'}}/>
                <input className="input num" defaultValue="12" style={{width:60, textAlign:'right'}}/>
                <input className="input num" defaultValue="15" style={{width:60, textAlign:'right'}}/>
                <span className="subtle" style={{fontSize:'var(--fs-sm)'}}>%</span>
              </div>
            </Field>
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

function SettingsPrinters({ theme }) {
  const printers = [
    { n:'Cuisine principale', m:'Epson TM-T88VI', ip:'192.168.1.48', st:'online', jobs:['Plats chauds','Grill','Fritures'] },
    { n:'Salade / Froid',     m:'Epson TM-T20III', ip:'192.168.1.52', st:'online', jobs:['Entrées froides','Salades'] },
    { n:'Bar',                m:'Star TSP100',    ip:'192.168.1.55', st:'offline', jobs:['Boissons','Cocktails'] },
    { n:'Ticket client',      m:'Epson TM-m30II', ip:'USB',          st:'online', jobs:['Factures'] },
  ];
  return (
    <SettingsShell theme={theme} active="printers">
      <div style={{maxWidth:880}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Imprimantes & KDS</h1>
            <p className="page-desc">Routage des tickets vers les imprimantes et écrans de cuisine.</p>
          </div>
          <button className="btn btn-primary"><Icon name="plus" size={14}/> Ajouter</button>
        </div>

        <Section title="Imprimantes">
          <div className="vstack" style={{gap:'var(--s-3)'}}>
            {printers.map((p, i) => (
              <div key={i} style={{padding:'var(--s-4)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)'}}>
                <div className="hstack" style={{justifyContent:'space-between', marginBottom:'var(--s-3)'}}>
                  <div className="hstack">
                    <div style={{width:40, height:40, borderRadius:'var(--r-sm)', background:'var(--surface-2)', display:'grid', placeItems:'center'}}>
                      <Icon name="clipboard" size={18}/>
                    </div>
                    <div>
                      <div style={{fontWeight:600, fontSize:'var(--fs-sm)'}}>{p.n}</div>
                      <div className="subtle mono" style={{fontSize:'var(--fs-xs)'}}>{p.m} · {p.ip}</div>
                    </div>
                  </div>
                  <div className="hstack">
                    {p.st === 'online' ? <span className="badge badge-success"><span className="badge-dot"/>En ligne</span> : <span className="badge badge-danger"><Icon name="warn" size={10}/>Hors ligne</span>}
                    <button className="btn btn-ghost btn-sm">Test</button>
                    <button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button>
                  </div>
                </div>
                <div className="hstack" style={{gap:4, flexWrap:'wrap'}}>
                  {p.jobs.map(j => <span key={j} className="chip" style={{fontSize:'var(--fs-xs)'}}>{j}</span>)}
                  <button className="chip" style={{fontSize:'var(--fs-xs)', borderStyle:'dashed'}}><Icon name="plus" size={10}/> Ajouter</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Écran de cuisine (KDS)" desc="Écrans connectés affichant les commandes en cours.">
          <div className="vstack" style={{gap:'var(--s-2)'}}>
            {[
              { n:'KDS Cuisine', d:'iPad Pro 12.9" · Salle', on:true },
              { n:'KDS Bar',     d:'iPad Air · Bar',         on:true },
            ].map((k, i) => (
              <div key={i} className="hstack" style={{justifyContent:'space-between', padding:'var(--s-3) var(--s-4)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)'}}>
                <div className="hstack">
                  <Icon name="fire" size={16}/>
                  <div>
                    <div style={{fontWeight:500, fontSize:'var(--fs-sm)'}}>{k.n}</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{k.d}</div>
                  </div>
                </div>
                <span className="badge badge-success"><span className="badge-dot"/>Connecté</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

function SettingsTeam({ theme }) {
  const team = [
    { n:'Tal Amsalem',   r:'Propriétaire', e:'tal@mamie.tlv',   st:'active',  init:'TA', on:true },
    { n:'Liora Benayoun',r:'Gérante',      e:'liora@mamie.tlv', st:'active',  init:'LB', on:true },
    { n:'Omer Azoulay',  r:'Chef',         e:'omer@mamie.tlv',  st:'active',  init:'OA', on:true },
    { n:'Nadav Peretz',  r:'Serveur',      e:'nadav@mamie.tlv', st:'active',  init:'NP', on:false },
    { n:'Rivka Chazan',  r:'Serveuse',     e:'rivka@mamie.tlv', st:'invited', init:'RC', on:false },
  ];
  const roles = [
    { r:'Propriétaire', d:'Accès total · facturation · suppression de compte' },
    { r:'Gérante',      d:'Tout sauf facturation et suppression' },
    { r:'Chef',         d:'Cuisine, stock, préparations, recettes, coûts' },
    { r:'Serveur',      d:'Commandes, clients, caisse — pas de configuration' },
  ];
  return (
    <SettingsShell theme={theme} active="team">
      <div style={{maxWidth:960}}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Équipe & rôles</h1>
            <p className="page-desc">{team.length} membres · {team.filter(t => t.on).length} connectés maintenant.</p>
          </div>
          <div className="hstack">
            <button className="btn btn-secondary"><Icon name="users" size={14}/> Gérer les rôles</button>
            <button className="btn btn-primary"><Icon name="plus" size={14}/> Inviter un membre</button>
          </div>
        </div>

        <Section title="Membres">
          <div style={{border:'1px solid var(--line)', borderRadius:'var(--r-md)', overflow:'hidden'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 180px 120px 140px 32px', gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)', background:'var(--surface-2)', fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'.06em'}}>
              <span>Nom</span><span>Rôle</span><span>Statut</span><span>Dernière activité</span><span/>
            </div>
            {team.map((m, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 180px 120px 140px 32px', gap:'var(--s-3)', padding:'var(--s-3) var(--s-4)', alignItems:'center', borderTop:'1px solid var(--line)', fontSize:'var(--fs-sm)'}}>
                <div className="hstack">
                  <div style={{width:36, height:36, borderRadius:'50%', background:`var(--cat-${(i%6)+1})`, color:'#fff', display:'grid', placeItems:'center', fontSize:'var(--fs-xs)', fontWeight:600, position:'relative'}}>
                    {m.init}
                    {m.on && <span style={{position:'absolute', bottom:-1, right:-1, width:10, height:10, borderRadius:'50%', background:'var(--success-500)', border:'2px solid var(--surface)'}}/>}
                  </div>
                  <div>
                    <div style={{fontWeight:500}}>{m.n}</div>
                    <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{m.e}</div>
                  </div>
                </div>
                <span>{m.r}</span>
                <span>
                  {m.st === 'active' ? <span className="badge badge-success"><span className="badge-dot"/>Actif</span>
                   : <span className="badge badge-warning">Invité</span>}
                </span>
                <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>{m.on ? 'Maintenant' : 'Hier'}</span>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={14}/></button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Rôles" desc="Définissent les permissions d'accès. Personnalisables dans Gérer les rôles.">
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'var(--s-3)'}}>
            {roles.map((r, i) => (
              <div key={i} style={{padding:'var(--s-4)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)'}}>
                <div className="hstack" style={{justifyContent:'space-between', marginBottom:6}}>
                  <span style={{fontWeight:600, fontSize:'var(--fs-sm)'}}>{r.r}</span>
                  <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={12}/></button>
                </div>
                <div className="subtle" style={{fontSize:'var(--fs-xs)', lineHeight:1.5}}>{r.d}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </SettingsShell>
  );
}

Object.assign(window, {
  SettingsGeneral, SettingsBranding, SettingsHours,
  SettingsPayments, SettingsPrinters, SettingsTeam,
});
