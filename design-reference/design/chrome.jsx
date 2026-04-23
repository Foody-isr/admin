// Shared app chrome: Sidebar + Topbar. Used by every screen mock.

const Icon = ({ name, size = 18 }) => {
  const P = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>,
    menu: <><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></>,
    fire: <><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-3 2-3 6a6 6 0 0 0 12 0c0-5-6-11-6-11Z"/></>,
    clipboard: <><rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/><path d="M9 12h6M9 16h4"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 7 0"/></>,
    chart: <><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="7" width="3" height="11"/><rect x="17" y="14" width="3" height="4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.14.68.37.93.67"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    chevronRight: <path d="m9 6 6 6-6 6"/>,
    chevronLeft: <path d="m15 6-6 6 6 6"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></>,
    sparkles: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>,
    filter: <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/>,
    command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/>,
    check: <path d="m5 12 5 5L20 7"/>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    warn: <><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v4M12 18h.01"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    edit: <><path d="M14 4l6 6-11 11H3v-6L14 4z"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></>,
    dots: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
    arrowUp: <path d="M12 19V5M5 12l7-7 7 7"/>,
    arrowDown: <path d="M12 5v14M5 12l7 7 7-7"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    dollar: <><path d="M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7"/></>,
    box: <><path d="M3 7 12 3l9 4v10l-9 4-9-4V7Z"/><path d="M3 7l9 4 9-4M12 11v10"/></>,
    cart: <><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 3h2l2.5 12h12L22 7H6"/></>,
    chef: <><path d="M6 14a5 5 0 1 1 2-9.5 4 4 0 0 1 8 0A5 5 0 1 1 18 14v6H6v-6Z"/><path d="M6 18h12"/></>,
    save: <><path d="M4 4h13l3 3v13H4z"/><path d="M7 4v6h10V4M7 20v-6h10v6"/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></>,
    layers: <><path d="M12 2 2 8l10 6 10-6-10-6Z"/><path d="M2 14l10 6 10-6M2 11l10 6 10-6"/></>,
    tag: <><path d="M3 12V3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.5"/></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></>,
    rtl: <><path d="M15 6l-6 6 6 6M21 12H9"/></>,
  };
  return <svg {...P}>{paths[name] || null}</svg>;
};

function Sidebar({ active = 'dashboard', restaurant = 'Mamie Tlv', collapsed = false, theme = 'dark' }) {
  const items = [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'home' },
    { id: 'menu', label: 'Articles et menus', icon: 'menu', expanded: active.startsWith('menu'), children: [
      { id: 'menu.items', label: 'Bibliothèque d\'articles' },
      { id: 'menu.cards', label: 'Cartes' },
      { id: 'menu.cats',  label: 'Catégories' },
      { id: 'menu.mods',  label: 'Modificateurs' },
      { id: 'menu.opts',  label: 'Options' },
    ]},
    { id: 'kitchen', label: 'Cuisine', icon: 'fire', count: 12, expanded: active.startsWith('kitchen'), children: [
      { id: 'kitchen.stock', label: 'Stock', count: 4 },
      { id: 'kitchen.prep',  label: 'Préparations', count: 8 },
      { id: 'kitchen.cost',  label: 'Coût alimentaire' },
      { id: 'kitchen.ops',   label: 'Opérations quotidiennes' },
      { id: 'kitchen.sup',   label: 'Approvisionnements' },
    ]},
    { id: 'orders', label: 'Commandes', icon: 'clipboard', live: true },
    { id: 'online', label: 'En ligne', icon: 'globe' },
    { id: 'customers', label: 'Clients', icon: 'users' },
    { id: 'reports', label: 'Rapports', icon: 'chart' },
    { id: 'settings', label: 'Paramètres', icon: 'settings' },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">M</div>
        {!collapsed && <div>
          <div className="name">{restaurant}</div>
          <div className="loc">Tel Aviv · Online</div>
        </div>}
      </div>
      <nav className="sidebar-nav">
        {items.map(it => (
          <div key={it.id}>
            <div className={`nav-item ${active === it.id || active.startsWith(it.id + '.') ? 'active' : ''}`}>
              <Icon name={it.icon}/>
              {!collapsed && <>
                <span>{it.label}</span>
                {it.live && <span className="dot-pulse" style={{marginLeft:'auto'}}/>}
                {it.count != null && <span className="count">{it.count}</span>}
                {it.children && <Icon name={it.expanded ? 'chevronDown' : 'chevronRight'} size={14}/>}
              </>}
            </div>
            {it.expanded && !collapsed && (
              <div className="nav-sub">
                {it.children.map(c => (
                  <div key={c.id} className={`nav-item ${active === c.id ? 'active' : ''}`}>
                    <span>{c.label}</span>
                    {c.count != null && <span className="count">{c.count}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="btn btn-ghost btn-icon btn-sm" title="Notifications"><Icon name="bell" size={16}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Calendrier"><Icon name="calendar" size={16}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Aide"><Icon name="help" size={16}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Foody AI"><Icon name="sparkles" size={16}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Thème">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16}/>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [], right = null }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={12}/>}
            <span className={i === crumbs.length - 1 ? 'current' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{flex:1}}/>
      <div className="input-group" style={{width: 320}}>
        <Icon name="search" size={14}/>
        <input placeholder="Rechercher, ou tapez une commande…"/>
        <kbd>⌘K</kbd>
      </div>
      {right}
      <button className="btn btn-ghost btn-icon"><Icon name="bell"/></button>
      <div className="avatar" style={{background:'linear-gradient(135deg, var(--brand-400), var(--brand-600))'}}>TA</div>
    </header>
  );
}

// Export to global scope for other scripts
Object.assign(window, { Icon, Sidebar, Topbar });
