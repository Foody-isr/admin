# Foody Admin — Design Handoff

Redesign complet de l'interface admin Foody : système de design unifié, écrans redesignés, audit UX, éditeurs en drawer, et paramètres.

Ouvrir **`design/index.html`** — c'est le hub principal (canvas interactif avec zoom/pan). Tous les écrans sont disposés côte à côte pour comparaison.

---

## Ce qui est livré

### 01 · Fondation
- **Audit UX** — les 8 problèmes identifiés dans l'app actuelle et comment on les corrige.
- **Design system Dark & Light** — tokens (couleurs, typo, espacement, radii, shadows), composants (boutons, champs, badges, chips, KPI, tables, onglets, cartes), patterns.

### 02 · Écrans principaux (Dark)
- Tableau de bord (accueil)
- Commandes (liste) + **Détails de commande (drawer)**
- Bibliothèque d'articles
- Cuisine · Stock + **Éditeur d'article en stock (drawer)**
- Cuisine · Préparations (sous-recettes) + **Éditeur de préparation (drawer)**
- Rapports · vue d'ensemble

### 03 · Éditeur d'article — 4 onglets
Détails · Modificateurs · Recette · Coût (avec breakdown, marge, prix suggéré).

### 04 · Paramètres — 6 sous-pages
Général · Image de marque · Horaires · Paiements & TVA · Imprimantes & KDS · Équipe & rôles.

### 05 & 06 · Versions Light
Tous les écrans principaux et les paramètres clés en thème clair — même structure, même hiérarchie, adapté aux environnements lumineux (back-office de jour).

---

## Principes directeurs

1. **Uniformité.** Chaque page utilise le même page-head, les mêmes KPIs, les mêmes chips de filtre, les mêmes tables. Aucun écran n'invente sa propre convention.
2. **Hiérarchie par la typographie, pas par la couleur.** Instrument Serif pour les grands chiffres (KPIs, totaux), Geist pour le corps, Geist Mono pour les chiffres tabulaires.
3. **L'orange est rare.** `#f97316` n'apparaît que sur les actions primaires et les états actifs — pas en décor. Les statuts utilisent leurs propres couleurs sémantiques (success/warning/danger/info).
4. **Densité équilibrée.** 14px de base, 8px grid, lignes de 44px dans les tables — pensé pour être utilisable au doigt en cuisine et précis à la souris en back-office.
5. **RTL-ready.** Tous les composants acceptent `dir="rtl"`. Exemples en hébreu visibles dans l'éditeur Stock (« Noms sur la facture »).
6. **Dark-first, Light-equal.** Le cuisine tourne en sombre ; le back-office en clair. Les deux thèmes partagent 100% des tokens sémantiques.

---

## Structure des fichiers

```
design/
├── index.html              ← hub principal (à ouvrir)
├── tokens.css              ← tous les tokens (couleurs, espacement, etc.)
├── components.css          ← styles de composants (boutons, cartes, tables…)
├── design-canvas.jsx       ← moteur du canvas pan/zoom
├── chrome.jsx              ← Sidebar + Topbar + icônes SVG
├── drawer.jsx              ← Drawer + Section + Field partagés
└── screens/
    ├── audit.jsx           ← Audit UX (annotations)
    ├── design-system.jsx   ← Doc du système
    ├── dashboard.jsx
    ├── orders.jsx
    ├── order-details.jsx   ← drawer
    ├── library.jsx
    ├── item-editor.jsx     ← 4 onglets (details, mods, recipe, cost)
    ├── stock.jsx
    ├── stock-editor.jsx    ← drawer
    ├── preparations.jsx
    ├── prep-editor.jsx     ← drawer avec recette et coût
    ├── reports.jsx
    └── settings.jsx        ← 6 sous-pages (Général, Marque, Horaires…)
```

---

## Pour les devs

Chaque écran est un composant React autonome qui prend une prop `theme="dark" | "light"`.

```jsx
<Dashboard theme="dark"/>
<Orders theme="light"/>
<SettingsGeneral theme="dark"/>
```

Tous les styles passent par les variables CSS de `tokens.css` :

```css
background: var(--bg);
color: var(--fg);
border: 1px solid var(--line);
```

**Switch de thème** : ajouter `data-theme="dark"` ou `data-theme="light"` sur un conteneur, tous les tokens basculent.

**Composants partagés** à réutiliser dans l'implémentation :
- `<Section title desc aside>` — bloc de formulaire titré
- `<Field label hint>` — champ labellisé (input, select, etc.)
- `<Drawer title width onClose onSave>` — panneau latéral full-height
- `Icon` — bibliothèque SVG (home, fire, clipboard, etc.)
- Classes utilitaires : `.kpi`, `.badge`, `.chip`, `.table`, `.btn-primary|secondary|ghost`

---

## Prochaines étapes suggérées

- **Command palette (⌘K)** : placeholder dans la topbar, à implémenter.
- **Bulk actions** : checkboxes sont présentes dans toutes les tables, action bar à ajouter quand sélection > 0.
- **Inline editing** : prévu pour les tables (quantité, prix) — les inputs du prep-editor servent de référence.
- **RTL complet** : tester systématiquement chaque écran en `dir="rtl"`.
- **Real-time** : les `dot-pulse` et badges "En cuisine" sont statiques — connecter au backend pour updates live.

---

*Généré à partir du projet source. Toutes les icônes sont SVG inline (pas de dépendance externe). Les polices viennent de Google Fonts (Geist, Geist Mono, Instrument Serif).*
