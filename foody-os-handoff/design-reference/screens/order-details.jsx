// Détails de la commande — order drawer
// Shows: customer, status timeline, items list with modifiers, totals, actions

function OrderDetails({ theme = 'dark' }) {
  const items = [
    { n:"L'OR ROUGE", qty:2, price:75, mods:['Sans coriandre','Extra citron'], note:'Pour Sarah' },
    { n:'SALADE DU DÉSERT', qty:1, price:62, mods:['Vinaigrette à part'] },
    { n:'CHAKCHOUKA', qty:1, price:58, mods:[] },
    { n:'POULET DOUBLE YUM', qty:2, price:95, mods:['Piment fort','Sans oignon'], note:'Bien cuit' },
    { n:'BOISSON — LIMONADE MAISON', qty:3, price:22, mods:[] },
  ];
  const subtotal = items.reduce((s, r) => s + r.qty * r.price, 0);
  const delivery = 15, tip = 20, tva = 0;
  const total = subtotal + delivery + tip + tva;

  const timeline = [
    { label:'Commande reçue', when:'14:32', done:true },
    { label:'Acceptée',       when:'14:33', done:true },
    { label:'En cuisine',     when:'14:35', done:true, active:true },
    { label:'Prête',          when:'—',    done:false },
    { label:'Livrée',         when:'—',    done:false },
  ];

  return (
    <div className={theme === 'dark' ? 'dark' : ''} data-theme={theme} style={{height:'100%', position:'relative', background:'var(--bg)', color:'var(--fg)', overflow:'hidden'}}>
      {/* Dimmed chrome */}
      <div style={{filter:'blur(2px)', opacity:.45, pointerEvents:'none', height:'100%'}}>
        <div className="app">
          <Sidebar active="orders" theme={theme}/>
          <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
            <Topbar crumbs={['Commandes']}/>
            <main className="main"/>
          </div>
        </div>
      </div>

      <Drawer
        title="Commande #357"
        width={1060}
        onClose={() => {}}
        onSave={() => {}}
        saveLabel="Marquer prête"
        footer={
          <div className="hstack" style={{gap:'var(--s-3)', justifyContent:'space-between'}}>
            <div className="hstack" style={{gap:'var(--s-2)'}}>
              <button className="btn btn-secondary"><Icon name="edit" size={14}/> Modifier</button>
              <button className="btn btn-secondary"><Icon name="clipboard" size={14}/> Imprimer ticket</button>
              <button className="btn btn-secondary"><Icon name="refresh" size={14}/> Rembourser</button>
            </div>
            <button className="btn btn-ghost" style={{color:'var(--danger-500)'}}>
              <Icon name="x" size={14}/> Annuler la commande
            </button>
          </div>
        }
      >
        {/* Status banner */}
        <div style={{
          padding:'var(--s-4) var(--s-5)',
          background:'color-mix(in oklab, var(--warning-500) 10%, var(--surface))',
          border:'1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))',
          borderRadius:'var(--r-md)',
          display:'grid', gridTemplateColumns:'1fr auto', gap:'var(--s-4)', alignItems:'center',
          marginBottom:'var(--s-4)',
        }}>
          <div>
            <div className="hstack" style={{gap:'var(--s-2)', marginBottom:4}}>
              <span className="dot-pulse" style={{background:'var(--warning-500)'}}/>
              <span style={{fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--warning-500)'}}>En cuisine · depuis 8 min</span>
            </div>
            <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>Temps estimé restant : 7 min · Promis à 14:55</div>
          </div>
          <div className="hstack" style={{gap:'var(--s-2)'}}>
            <button className="btn btn-secondary btn-sm">+5 min</button>
            <button className="btn btn-secondary btn-sm">Contacter client</button>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 340px', gap:'var(--s-5)'}}>
          {/* LEFT — items + timeline */}
          <div className="vstack" style={{gap:'var(--s-4)'}}>
            {/* Timeline */}
            <Section title="Progression">
              <div style={{display:'grid', gridTemplateColumns:`repeat(${timeline.length}, 1fr)`, gap:0, position:'relative'}}>
                {timeline.map((t, i) => (
                  <div key={i} style={{textAlign:'center', position:'relative'}}>
                    {/* Connector */}
                    {i < timeline.length - 1 && (
                      <div style={{position:'absolute', top:14, left:'50%', right:'-50%', height:2, background: timeline[i + 1].done || t.active ? 'var(--brand-500)' : 'var(--line)'}}/>
                    )}
                    {/* Dot */}
                    <div style={{
                      width:28, height:28, borderRadius:'50%',
                      margin:'0 auto 8px',
                      background: t.active ? 'var(--brand-500)' : t.done ? 'var(--success-500)' : 'var(--surface-3)',
                      color: t.done || t.active ? '#fff' : 'var(--fg-muted)',
                      display:'grid', placeItems:'center',
                      position:'relative', zIndex:1,
                      boxShadow: t.active ? '0 0 0 4px color-mix(in oklab, var(--brand-500) 20%, transparent)' : 'none',
                    }}>
                      {t.done ? <Icon name="check" size={14}/> : t.active ? <span className="dot-pulse" style={{background:'#fff', width:6, height:6}}/> : null}
                    </div>
                    <div style={{fontSize:'var(--fs-xs)', fontWeight:500, color: t.done || t.active ? 'var(--fg)' : 'var(--fg-muted)'}}>
                      {t.label}
                    </div>
                    <div className="subtle num" style={{fontSize:'var(--fs-xs)', marginTop:2}}>{t.when}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Items */}
            <Section
              title={`${items.length} articles · ${items.reduce((s, r) => s + r.qty, 0)} unités`}
              aside={<button className="btn btn-ghost btn-sm"><Icon name="plus" size={12}/> Ajouter un article</button>}
            >
              <div className="vstack" style={{gap:0}}>
                {items.map((r, i) => (
                  <div key={i} style={{
                    display:'grid', gridTemplateColumns:'44px 1fr auto', gap:'var(--s-3)',
                    padding:'var(--s-3) 0', alignItems:'flex-start',
                    borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                  }}>
                    <div style={{
                      width:44, height:44, borderRadius:8,
                      background: `var(--cat-${(i % 6) + 1})`,
                      color:'#fff', fontWeight:600,
                      display:'grid', placeItems:'center',
                      fontSize:'var(--fs-sm)',
                      letterSpacing:'-0.02em',
                    }}>{r.qty}×</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:500, fontSize:'var(--fs-sm)'}}>{r.n}</div>
                      {r.mods.length > 0 && (
                        <div className="hstack" style={{gap:4, flexWrap:'wrap', marginTop:4}}>
                          {r.mods.map(m => (
                            <span key={m} style={{
                              padding:'2px 8px', borderRadius:999,
                              background:'var(--surface-2)', color:'var(--fg-muted)',
                              fontSize:'var(--fs-xs)',
                            }}>{m}</span>
                          ))}
                        </div>
                      )}
                      {r.note && (
                        <div className="hstack" style={{gap:4, marginTop:6, color:'var(--fg-muted)', fontSize:'var(--fs-xs)', fontStyle:'italic'}}>
                          <Icon name="edit" size={10}/>
                          <span>"{r.note}"</span>
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div className="num" style={{fontWeight:500}}>₪{r.qty * r.price}</div>
                      <div className="subtle num" style={{fontSize:'var(--fs-xs)'}}>₪{r.price} × {r.qty}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* RIGHT rail */}
          <div className="vstack" style={{gap:'var(--s-4)'}}>
            {/* Customer card */}
            <div className="card" style={{padding:'var(--s-5)'}}>
              <div className="hstack" style={{gap:'var(--s-3)', marginBottom:'var(--s-4)'}}>
                <div style={{
                  width:48, height:48, borderRadius:'50%',
                  background:'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
                  display:'grid', placeItems:'center', color:'#fff', fontWeight:600,
                }}>SC</div>
                <div>
                  <div style={{fontWeight:600, fontSize:'var(--fs-md)'}}>Sarah Cohen</div>
                  <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>
                    <span className="badge badge-info" style={{marginRight:6}}>VIP</span>
                    24 commandes · Client depuis 2023
                  </div>
                </div>
              </div>
              <div className="vstack" style={{gap:'var(--s-2)', fontSize:'var(--fs-sm)'}}>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Téléphone</span>
                  <span className="num">+972 54 123 4567</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Type</span>
                  <span>Pickup · 14:55</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Source</span>
                  <span className="hstack" style={{gap:4}}><Icon name="globe" size={12}/>Site web</span>
                </div>
              </div>
              <div style={{height:1, background:'var(--line)', margin:'var(--s-4) 0'}}/>
              <button className="btn btn-secondary btn-sm" style={{width:'100%'}}>
                <Icon name="user" size={12}/> Voir la fiche client
              </button>
            </div>

            {/* Totals */}
            <Section title="Total">
              <div className="vstack" style={{gap:'var(--s-2)', fontSize:'var(--fs-sm)'}}>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Sous-total</span>
                  <span className="num">₪{subtotal}.00</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Frais de livraison</span>
                  <span className="num">₪{delivery}.00</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">Pourboire</span>
                  <span className="num">₪{tip}.00</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between'}}>
                  <span className="subtle">TVA (incluse)</span>
                  <span className="num">₪0.00</span>
                </div>
                <div style={{height:1, background:'var(--line)', margin:'var(--s-2) 0'}}/>
                <div className="hstack" style={{justifyContent:'space-between', fontSize:'var(--fs-lg)', fontWeight:600}}>
                  <span>Total</span>
                  <span className="num">₪{total}.00</span>
                </div>
                <div className="hstack" style={{justifyContent:'space-between', marginTop:'var(--s-2)'}}>
                  <span className="badge badge-warning"><Icon name="warn" size={10}/> À payer</span>
                  <span className="subtle" style={{fontSize:'var(--fs-xs)'}}>Paiement en espèces</span>
                </div>
              </div>
            </Section>

            <Section title="Activité">
              <div className="vstack" style={{gap:'var(--s-3)', fontSize:'var(--fs-xs)'}}>
                {[
                  { t:'14:35', a:'Omer', w:'a démarré la préparation' },
                  { t:'14:33', a:'Liora', w:'a accepté la commande' },
                  { t:'14:32', a:'Système', w:'commande créée depuis le site' },
                ].map((e, i) => (
                  <div key={i} className="hstack" style={{gap:'var(--s-3)'}}>
                    <span className="mono subtle" style={{fontSize:11}}>{e.t}</span>
                    <div style={{flex:1}}>
                      <b>{e.a}</b> <span className="subtle">{e.w}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

Object.assign(window, { OrderDetails });
