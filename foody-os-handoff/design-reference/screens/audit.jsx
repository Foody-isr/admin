// UX Audit — annotated critique of existing screens
function Audit({ theme = 'dark' }) {
  const issues = [
    { cat:'Cohérence', sev:'high', title:'Styles divergents entre pages', desc:'Les cartes KPI du tableau de bord, de la bibliothèque et du stock utilisent 3 treatments différents (gradient, bordure, plat).', fix:'Un seul composant .kpi partagé.' },
    { cat:'Cohérence', sev:'high', title:'Trop de styles de badges', desc:'Statuts orange/vert/jaune avec des nuances inégales; certains ont un point, d\'autres pas.', fix:'Tokens sémantiques unifiés + dot systématique.' },
    { cat:'Hiérarchie', sev:'med', title:'Titres de page noyés', desc:'"Stock", "Accueil" ont la même taille que les sous-titres des cartes — manque de hiérarchie.', fix:'page-title 28px à -0.02em, page-desc 13px muted.' },
    { cat:'Navigation', sev:'high', title:'Sidebar surchargée en mode étendu', desc:'Trop de niveaux avec des badges, bordures colorées, indicateurs — pollution visuelle.', fix:'Rail orange uniquement pour l\'actif, comptes en pill discrète.' },
    { cat:'Tables', sev:'med', title:'Lignes de tableaux peu scannables', desc:'Padding inégal, séparateurs faibles, pas d\'alignement tabulaire des nombres.', fix:'Grille 16px, nombres en Geist Mono, hover surface-2.' },
    { cat:'Données', sev:'med', title:'États vides décevants', desc:'Dashboard avec ₪0 commandes/clients = impression cassée. Pas d\'onboarding.', fix:'États vides avec prochaine action évidente.' },
    { cat:'Density', sev:'low', title:'Espace gaspillé sur le topbar', desc:'Le topbar noir occupe toute la largeur sans contenu utile (juste icônes).', fix:'Breadcrumbs + palette de commandes intégrée.' },
    { cat:'Modales', sev:'med', title:'Modale Modifier article = assise à 80%', desc:'L\'arrière-plan reste visible mais pas cliquable — ambigu.', fix:'Drawer plein-écran ou modale vraiment centrée avec overlay opaque.' },
    { cat:'Feedback', sev:'low', title:'Pas d\'indicateur "enregistré"', desc:'Bouton Enregistrer toujours actif — l\'utilisateur ne sait pas si c\'est à jour.', fix:'Badge "Enregistré" + autosave + timestamp.' },
    { cat:'Actions', sev:'high', title:'Pas de sélection multiple', desc:'Actions toujours par ligne — impossible de supprimer ou changer de statut en masse.', fix:'Checkboxes partout + barre d\'actions flottante.' },
    { cat:'Recherche', sev:'med', title:'Recherche limitée à la page', desc:'Pas de recherche globale, pas de palette de commandes.', fix:'⌘K avec recherche globale + navigation + actions.' },
  ];

  const sevColor = { high:'var(--danger-500)', med:'var(--warning-500)', low:'var(--info-500)' };
  const sevLabel = { high:'Critique', med:'À corriger', low:'Amélioration' };

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', overflow:'auto', background:'var(--bg)', color:'var(--fg)'}}>
      <div style={{maxWidth:1160, margin:'0 auto', padding:'var(--s-12) var(--s-8)'}}>
        <div style={{marginBottom:'var(--s-10)'}}>
          <div className="badge badge-danger" style={{marginBottom:'var(--s-3)'}}>Audit UX · Foody Admin actuel</div>
          <h1 style={{fontSize:48, fontWeight:600, letterSpacing:'-0.03em', lineHeight:1.05, margin:0}}>Ce qui ne va pas,<br/><span style={{color:'var(--fg-muted)'}}>et ce qu'on change.</span></h1>
          <p className="muted" style={{fontSize:'var(--fs-lg)', maxWidth:720, marginTop:'var(--s-3)'}}>11 problèmes identifiés sur les 7 écrans revus. Chacun est corrigé dans les redesigns proposés dans ce document.</p>
        </div>

        {/* Summary */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'var(--s-4)', marginBottom:'var(--s-10)'}}>
          <div className="kpi"><div className="kpi-label">Problèmes trouvés</div><div className="kpi-value">11</div></div>
          <div className="kpi"><div className="kpi-label">Critiques</div><div className="kpi-value" style={{color:'var(--danger-500)'}}>3</div></div>
          <div className="kpi"><div className="kpi-label">À corriger</div><div className="kpi-value" style={{color:'var(--warning-500)'}}>5</div></div>
          <div className="kpi"><div className="kpi-label">Améliorations</div><div className="kpi-value" style={{color:'var(--info-500)'}}>3</div></div>
        </div>

        {/* Issues list */}
        <div className="vstack" style={{gap:'var(--s-3)'}}>
          {issues.map((it, i) => (
            <div className="card" key={i} style={{padding:'var(--s-5)', display:'grid', gridTemplateColumns:'48px 1fr', gap:'var(--s-4)'}}>
              <div style={{width:40, height:40, borderRadius:10, background:`color-mix(in oklab, ${sevColor[it.sev]} 12%, transparent)`, color:sevColor[it.sev], display:'grid', placeItems:'center', fontWeight:700, fontFamily:'var(--font-mono)'}}>{String(i+1).padStart(2,'0')}</div>
              <div>
                <div className="hstack" style={{marginBottom:'var(--s-2)'}}>
                  <span className="badge" style={{background:`color-mix(in oklab, ${sevColor[it.sev]} 14%, transparent)`, color:sevColor[it.sev]}}><span className="badge-dot"/>{sevLabel[it.sev]}</span>
                  <span className="badge badge-neutral">{it.cat}</span>
                </div>
                <div style={{fontSize:'var(--fs-lg)', fontWeight:600, marginBottom:4}}>{it.title}</div>
                <div className="muted" style={{fontSize:'var(--fs-sm)', marginBottom:'var(--s-2)'}}>{it.desc}</div>
                <div className="hstack" style={{fontSize:'var(--fs-sm)', color:'var(--success-500)'}}>
                  <Icon name="check" size={14}/> <span style={{color:'var(--fg)'}}>{it.fix}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Manifesto */}
        <div className="card" style={{marginTop:'var(--s-10)', padding:'var(--s-8)', background:'linear-gradient(135deg, color-mix(in oklab, var(--brand-500) 6%, var(--surface)), var(--surface))', borderColor:'color-mix(in oklab, var(--brand-500) 20%, var(--line))'}}>
          <div style={{fontSize:'var(--fs-2xl)', fontWeight:600, letterSpacing:'-0.01em', marginBottom:'var(--s-3)'}}>Le fil conducteur</div>
          <p className="muted" style={{fontSize:'var(--fs-md)', maxWidth:720}}>Chaque écran doit respirer la même grammaire : même rythme d'espace, même type d'en-tête, même traitement de tableau, même ton. Les différences ne doivent apparaître que là où l'information le demande.</p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Audit });
