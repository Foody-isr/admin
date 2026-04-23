// Shared patterns for Foody editors/overlays.
//
// Rule:
// - Editing (create/modify) → <FullScreenEditor>: inset modal with head, optional left rail, main content.
// - Read + quick actions → <Drawer>: right-anchored slide-over.
//
// Both match the Item Editor visual language: 60px head, close (left),
// title + subtitle (center), save/cancel (right), bordered/rounded container.

function FullScreenEditor({
  title,
  subtitle,
  status,               // node for badge like <span className="badge badge-success">Actif</span>
  onClose, onSave,
  saveLabel = 'Enregistrer',
  showCancel = true,
  rail,                 // optional left rail (React node) — when present, renders 280px column
  children,
  footer,               // optional sticky footer
}) {
  return (
    <>
      {/* Dim backdrop */}
      <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.5)'}} onClick={onClose}/>
      {/* Container */}
      <div style={{
        position:'absolute', inset:'32px 24px 24px 24px',
        background:'var(--bg)', color:'var(--fg)',
        borderRadius:'var(--r-xl)', border:'1px solid var(--line)',
        overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'var(--shadow-3)',
      }}>
        {/* Head — matches Item Editor: close left, centered title, actions right */}
        <div style={{
          height:60, padding:'0 var(--s-5)',
          borderBottom:'1px solid var(--line)',
          display:'flex', alignItems:'center', gap:'var(--s-4)',
          background:'var(--surface)',
        }}>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x"/>
          </button>
          <div style={{flex:1, textAlign:'center', minWidth:0}}>
            <div style={{fontSize:'var(--fs-md)', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{title}</div>
            {subtitle && <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{subtitle}</div>}
          </div>
          <div className="hstack">
            {status}
            {showCancel && <button className="btn btn-secondary btn-sm" onClick={onClose}>Annuler</button>}
            <button className="btn btn-primary btn-sm" onClick={onSave}>
              <Icon name="save" size={14}/> {saveLabel}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{
          flex:1,
          display:'grid',
          gridTemplateColumns: rail ? '280px 1fr' : '1fr',
          overflow:'hidden',
          minHeight:0,
        }}>
          {rail && (
            <div style={{
              borderRight:'1px solid var(--line)',
              background:'var(--surface)',
              padding:'var(--s-5)',
              overflowY:'auto',
            }}>
              {rail}
            </div>
          )}
          <div style={{overflowY:'auto', padding:'var(--s-6) var(--s-8)', minWidth:0}}>
            {children}
          </div>
        </div>

        {footer && (
          <div style={{borderTop:'1px solid var(--line)', padding:'var(--s-3) var(--s-5)', background:'var(--surface)'}}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

// --- Drawer (right-anchored, for read + actions) ---
function Drawer({ title, subtitle, onClose, onSave, saveLabel = 'Mettre à jour', primaryAction, width = 720, children, footer }) {
  return (
    <>
      <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)'}} onClick={onClose}/>
      <aside style={{
        position:'absolute', top:0, bottom:0, right:0, width,
        background:'var(--bg)', color:'var(--fg)',
        display:'flex', flexDirection:'column',
        boxShadow:'var(--shadow-3)',
        borderLeft:'1px solid var(--line)',
      }}>
        {/* Head — same visual rhythm as FullScreenEditor */}
        <div style={{
          height:60, padding:'0 var(--s-5)',
          display:'flex', alignItems:'center', gap:'var(--s-4)',
          borderBottom:'1px solid var(--line)',
          background:'var(--surface)',
        }}>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x"/>
          </button>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:'var(--fs-md)', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{title}</div>
            {subtitle && <div className="subtle" style={{fontSize:'var(--fs-xs)'}}>{subtitle}</div>}
          </div>
          {primaryAction || (onSave && (
            <button className="btn btn-primary btn-sm" onClick={onSave}>{saveLabel}</button>
          ))}
        </div>
        {/* Body (scrollable) */}
        <div style={{flex:1, overflow:'auto', padding:'var(--s-5)'}}>
          {children}
        </div>
        {footer && (
          <div style={{borderTop:'1px solid var(--line)', padding:'var(--s-3) var(--s-5)', background:'var(--surface)'}}>
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

// --- Form building blocks (shared) ---
function Section({ title, desc, children, aside }) {
  return (
    <div className="card" style={{marginBottom:'var(--s-4)'}}>
      <div style={{padding:'var(--s-5)', paddingBottom: desc ? 'var(--s-3)' : 'var(--s-4)'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'var(--s-3)'}}>
          <div style={{fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--fg)'}}>{title}</div>
          {aside}
        </div>
        {desc && <div className="subtle" style={{fontSize:'var(--fs-xs)', marginTop:4}}>{desc}</div>}
      </div>
      <div style={{padding:'0 var(--s-5) var(--s-5)'}}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children, grow }) {
  return (
    <label style={{display:'flex', flexDirection:'column', gap:6, flex: grow ? 1 : 'none', minWidth:0}}>
      {label && <span style={{fontSize:'var(--fs-xs)', fontWeight:500, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'.06em'}}>{label}</span>}
      {children}
      {hint && <span style={{fontSize:'var(--fs-xs)', color:'var(--fg-subtle)'}}>{hint}</span>}
    </label>
  );
}

Object.assign(window, { FullScreenEditor, Drawer, Section, Field });
