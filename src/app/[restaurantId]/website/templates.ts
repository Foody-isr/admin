// Website templates — ready-made multi-page site designs the owner can apply in
// one click, then swap in their own images/text. A template is pure data: a set
// of custom pages plus sections per page. Applying one seeds the builder draft
// (see applyTemplate in page.tsx); images are left empty for the owner to upload.

export type TemplateSection = {
  page: string; // 'home' | 'order' | 'catering' | a custom page slug
  section_type: string;
  layout?: string;
  content: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type TemplatePage = { slug: string; label: string; sort_order: number; show_in_nav: boolean };

export type WebsiteTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** When true, the design leans on the catering shop; shown as a hint. */
  usesCatering?: boolean;
  pages: TemplatePage[];
  sections: TemplateSection[];
};

const HERO = (headline: string, subheadline: string, cta_text: string, cta_link: string): TemplateSection => ({
  page: 'home',
  section_type: 'hero_banner',
  layout: 'centered',
  content: { headline, subheadline, cta_text, cta_link, image_url: '' },
  settings: { color_style: 'dark', height: 'tall', text_alignment: 'center' },
});

const ABOUT = (title: string, body: string): TemplateSection => ({
  page: 'home',
  section_type: 'about',
  layout: 'centered',
  content: { blocks: [{ title, body, image_url: '' }] },
  settings: { color_style: 'light' },
});

const GALLERY = (page = 'home'): TemplateSection => ({
  page,
  section_type: 'gallery',
  content: { images: [] },
  settings: { color_style: 'light' },
});

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  {
    id: 'bakery-catering',
    name: 'Boulangerie & Traiteur',
    description: 'Accueil vitrine avec cartes vers vos univers (boutiques, plateaux, pâtisserie, traiteur), histoire et galerie. Idéal boulangerie-pâtisserie avec service traiteur.',
    emoji: '\u{1F950}',
    usesCatering: true,
    pages: [
      { slug: 'boutiques', label: 'Nos Boutiques', sort_order: 0, show_in_nav: true },
      { slug: 'galerie', label: 'Galerie', sort_order: 1, show_in_nav: true },
    ],
    sections: [
      HERO('Un sublime mélange', "De qualité et d'excellence", 'Commander', '/order'),
      {
        page: 'home',
        section_type: 'feature_cards',
        content: {
          cards: [
            { image_url: '', title: 'Nos Boutiques', subtitle: '', link: '/boutiques' },
            { image_url: '', title: 'Nos Plateaux', subtitle: '', link: '/catering' },
            { image_url: '', title: 'Nos Pâtisseries', subtitle: '', link: '/galerie' },
            { image_url: '', title: 'Notre Traiteur', subtitle: '', link: '/catering' },
          ],
        },
        settings: { color_style: 'light' },
      },
      ABOUT('Notre histoire', 'Racontez votre histoire, votre savoir-faire et ce qui rend vos produits uniques.'),
      GALLERY('home'),
      {
        page: 'boutiques',
        section_type: 'text_and_image',
        content: { title: 'Nos Boutiques', body: "Présentez vos points de vente, adresses et horaires.", image_position: 'right', image_url: '' },
        settings: { color_style: 'light' },
      },
      GALLERY('boutiques'),
      GALLERY('galerie'),
      {
        page: 'catering',
        section_type: 'hero_banner',
        layout: 'centered',
        content: { headline: 'Service Traiteur', subheadline: 'Plateaux et prestations pour tous vos événements', cta_text: '', cta_link: '', image_url: '' },
        settings: { color_style: 'dark', height: 'medium', text_alignment: 'center' },
      },
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'Accueil chaleureux : bannière, plats phares, histoire, avis clients et galerie. Parfait pour un restaurant avec menu en ligne.',
    emoji: '\u{1F37D}\u{FE0F}',
    pages: [
      { slug: 'galerie', label: 'Galerie', sort_order: 0, show_in_nav: true },
    ],
    sections: [
      HERO('Bienvenue chez nous', 'Une cuisine faite maison, avec passion', 'Voir le menu', '/order'),
      {
        page: 'home',
        section_type: 'menu_highlights',
        content: { title: 'Nos incontournables', subtitle: 'Les plats préférés de nos clients', item_ids: [] },
        settings: { color_style: 'light' },
      },
      ABOUT('Notre maison', 'Décrivez votre restaurant, votre équipe et votre cuisine.'),
      {
        page: 'home',
        section_type: 'testimonials',
        content: { reviews: [] },
        settings: { color_style: 'light' },
      },
      GALLERY('home'),
      GALLERY('galerie'),
    ],
  },
  {
    id: 'cafe',
    name: 'Café & Salon de thé',
    description: 'Design épuré : bannière, présentation, galerie et boutons vers vos horaires et contact. Idéal café, coffee shop ou salon de thé.',
    emoji: '\u{2615}',
    pages: [],
    sections: [
      HERO('Votre pause gourmande', 'Cafés, pâtisseries et douceurs faites maison', 'Commander', '/order'),
      ABOUT('Le lieu', 'Présentez votre café, son ambiance et vos spécialités.'),
      GALLERY('home'),
      {
        page: 'home',
        section_type: 'action_buttons',
        content: { buttons: [{ label: 'Commander', action: 'view_menu', style: 'primary' }, { label: 'Nous trouver', action: 'external_link', target: '', style: 'outline' }] },
        settings: { color_style: 'light', text_alignment: 'center' },
      },
    ],
  },
  {
    id: 'traiteur',
    name: 'Traiteur / Événementiel',
    description: 'Vitrine orientée traiteur : bannière, cartes de prestations, histoire et galerie, avec la boutique traiteur en avant.',
    emoji: '\u{1F374}',
    usesCatering: true,
    pages: [
      { slug: 'galerie', label: 'Galerie', sort_order: 0, show_in_nav: true },
    ],
    sections: [
      HERO('Traiteur événementiel', 'Des prestations sur mesure pour tous vos événements', 'Demander un devis', '/catering'),
      {
        page: 'home',
        section_type: 'feature_cards',
        content: {
          cards: [
            { image_url: '', title: 'Plateaux', subtitle: '', link: '/catering' },
            { image_url: '', title: 'Buffets', subtitle: '', link: '/catering' },
            { image_url: '', title: 'Réceptions', subtitle: '', link: '/catering' },
          ],
        },
        settings: { color_style: 'light' },
      },
      ABOUT('Notre savoir-faire', 'Mettez en avant votre expérience et vos références traiteur.'),
      GALLERY('home'),
      GALLERY('galerie'),
      {
        page: 'catering',
        section_type: 'hero_banner',
        layout: 'centered',
        content: { headline: 'Nos prestations', subheadline: 'Choisissez votre formule ci-dessous', cta_text: '', cta_link: '', image_url: '' },
        settings: { color_style: 'dark', height: 'medium', text_alignment: 'center' },
      },
    ],
  },
];
