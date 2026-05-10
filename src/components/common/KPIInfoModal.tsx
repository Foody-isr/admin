'use client';

import { X, Info } from 'lucide-react';
import { useEffect } from 'react';

export interface KPIInfo {
  title: string;
  description: string;
  formula: string;
  example?: string;
  interpretation: string;
}

interface Props {
  kpiInfo: KPIInfo | null;
  onClose: () => void;
}

// Figma-ported KPI info modal. Opens when a KPI card is clicked and shows
// Description / Formule / Exemple / Interprétation.
export default function KPIInfoModal({ kpiInfo, onClose }: Props) {
  useEffect(() => {
    if (!kpiInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kpiInfo, onClose]);

  if (!kpiInfo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#111111] rounded-2xl shadow-2xl max-w-2xl w-full mx-4 border border-neutral-200 dark:border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <Info size={20} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {kpiInfo.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <Section title="Description">
            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {kpiInfo.description}
            </p>
          </Section>

          <Section title="Formule de calcul">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4">
              <code className="text-orange-900 dark:text-orange-300 font-mono text-sm">
                {kpiInfo.formula}
              </code>
            </div>
          </Section>

          {kpiInfo.example && (
            <Section title="Exemple">
              <div className="bg-neutral-50 dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
                <p className="text-neutral-700 dark:text-neutral-300 text-sm">
                  {kpiInfo.example}
                </p>
              </div>
            </Section>
          )}

          <Section title="Interprétation">
            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {kpiInfo.interpretation}
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

// KPI information database — ported from foodyadmin_figma/src/app/components/KPIInfoModal.tsx.
export const KPI_INFO: Record<string, KPIInfo> = {
  // ── Dashboard ───────────────────────────────────────────────────
  'revenue': {
    title: "Chiffre d'affaires",
    description:
      "Le chiffre d'affaires représente le montant total des ventes réalisées sur la période sélectionnée.",
    formula: 'CA = Somme de toutes les ventes',
    example: "Si vous avez vendu 45 commandes pour un total de ₪2,845, votre CA est de ₪2,845.",
    interpretation:
      "Un chiffre d'affaires en hausse indique une augmentation de l'activité. Comparez-le aux périodes précédentes pour identifier les tendances.",
  },
  'orders': {
    title: 'Commandes',
    description: 'Le nombre total de commandes passées par vos clients sur la période.',
    formula: 'Commandes = Nombre total de transactions',
    example: "Si 45 clients ont passé commande aujourd'hui, le compteur affiche 45.",
    interpretation:
      "Plus de commandes signifie généralement plus d'activité. Surveillez ce KPI pour détecter les pics et les creux d'activité.",
  },
  'customers': {
    title: 'Clients',
    description: 'Le nombre de clients uniques ayant effectué au moins une commande.',
    formula: 'Clients = Nombre de clients uniques actifs',
    example: 'Si 128 clients différents ont commandé, le compteur affiche 128.',
    interpretation:
      'Un nombre croissant de clients indique une expansion de votre base clientèle et une meilleure rétention.',
  },
  'average-ticket': {
    title: 'Ticket moyen',
    description: 'Le montant moyen dépensé par commande.',
    formula: 'Ticket moyen = Chiffre d\'affaires ÷ Nombre de commandes',
    example: 'CA de ₪2,845 ÷ 45 commandes = ₪63.22 par commande.',
    interpretation:
      'Un ticket moyen élevé suggère que vos clients achètent plus. Augmentez-le avec des ventes additionnelles et des upsells.',
  },

  // ── Articles ────────────────────────────────────────────────────
  'total-articles': {
    title: 'Total Articles',
    description: "Le nombre total d'articles actuellement dans votre catalogue.",
    formula: "Total = Nombre d'articles actifs + inactifs",
    example: 'Si vous avez 8 articles dans votre menu, le compteur affiche 8.',
    interpretation:
      'Un catalogue trop large peut compliquer la gestion. Un catalogue trop restreint peut limiter les ventes.',
  },
  'disponibles': {
    title: 'Disponibles',
    description: "Le nombre d'articles marqués comme disponibles à la vente.",
    formula: 'Disponibles = Articles avec statut "Disponible"',
    example: 'Si 8 articles sur 10 sont disponibles, le compteur affiche 8.',
    interpretation:
      'Assurez-vous que vos articles les plus populaires sont toujours disponibles pour maximiser les ventes.',
  },
  'revenu-moyen': {
    title: 'Revenu Moyen',
    description: 'Le prix de vente moyen de tous vos articles.',
    formula: "Revenu moyen = Somme des prix ÷ Nombre d'articles",
    example: 'Si la somme de vos prix est ₪148.5 pour 8 articles: ₪148.5 ÷ 8 = ₪18.5',
    interpretation:
      'Utilisez ce KPI pour vous assurer que votre tarification est cohérente et compétitive.',
  },
  'rupture-stock': {
    title: 'Rupture Stock',
    description: "Le nombre d'articles marqués comme indisponibles ou en rupture.",
    formula: 'Rupture = Articles avec statut "Indisponible"',
    example: 'Si 0 article est en rupture, le compteur affiche 0.',
    interpretation:
      'Les ruptures de stock entraînent des ventes perdues. Minimisez ce nombre en gérant mieux vos approvisionnements.',
  },

  // ── Stock ───────────────────────────────────────────────────────
  'articles-stock': {
    title: 'Articles en stock',
    description: "Le nombre total d'ingrédients et fournitures dans votre inventaire.",
    formula: "Total = Nombre d'articles en inventaire",
    example: 'Si vous gérez 150 ingrédients différents, le compteur affiche 150.',
    interpretation: 'Un inventaire optimisé réduit le gaspillage et les coûts de stockage.',
  },
  'statut-ok': {
    title: 'Statut OK',
    description: "Le nombre d'articles avec un niveau de stock satisfaisant.",
    formula: 'OK = Articles avec stock > seuil minimum',
    example: 'Si 140 articles sur 150 ont un stock suffisant, le compteur affiche 140.',
    interpretation:
      "Un pourcentage élevé d'articles OK (>90%) indique une bonne gestion des stocks.",
  },
  'valeur-totale': {
    title: 'Valeur Totale',
    description: 'La valeur monétaire totale de votre stock actuel.',
    formula: 'Valeur = Somme (Quantité × Prix unitaire) pour tous les articles',
    example:
      "Si vous avez 10kg d'ingrédient A à ₪5/kg + 5kg d'ingrédient B à ₪10/kg: (10×5) + (5×10) = ₪100",
    interpretation:
      'Surveillez cette valeur pour optimiser votre trésorerie et éviter le surstockage.',
  },
  'stock-bas': {
    title: 'Stock Bas',
    description:
      "Le nombre d'articles dont le niveau de stock est inférieur au seuil critique.",
    formula: 'Bas = Articles avec stock < seuil critique',
    example: 'Si 4 articles sont en dessous du seuil minimum, le compteur affiche 4.',
    interpretation:
      "Un stock bas nécessite une commande urgente pour éviter les ruptures et interruptions de service.",
  },

  // ── Food Cost ───────────────────────────────────────────────────
  'food-cost-moyen': {
    title: '% Coût Moyen',
    description:
      'Le pourcentage moyen du coût alimentaire par rapport au prix de vente.',
    formula: 'Coût moyen = (Moyenne des coûts alimentaires ÷ Moyenne des prix) × 100',
    example:
      "Si vos articles ont un coût alimentaire moyen de 35%: cela signifie que 35% du prix de vente couvre les ingrédients.",
    interpretation:
      'Idéalement, visez 25-35%. Au-delà de 35%, votre rentabilité est affectée. En dessous de 25%, vos prix sont peut-être trop élevés.',
  },
  'articles-critiques': {
    title: 'Articles Critiques',
    description: "Le nombre d'articles avec un coût alimentaire supérieur à 40%.",
    formula: 'Critiques = Articles avec (Coût alimentaire ÷ Prix) > 40%',
    example: 'Si 2 articles sur 10 ont un food cost > 40%, le compteur affiche 2.',
    interpretation:
      "Ces articles menacent votre rentabilité. Augmentez les prix, réduisez les portions, ou trouvez des ingrédients moins chers.",
  },
  'marge-totale': {
    title: 'Marge Totale',
    description: 'La somme des marges brutes de tous vos articles.',
    formula:
      'Marge totale = Somme (Prix de vente - Coût alimentaire) pour tous les articles',
    example:
      'Si article A génère ₪15 de marge et article B génère ₪20: Marge totale = ₪15 + ₪20 = ₪35',
    interpretation:
      'Concentrez-vous sur les articles à forte marge pour maximiser votre profitabilité globale.',
  },
  'articles-optimaux': {
    title: 'Articles Optimaux',
    description:
      "Le nombre d'articles avec un coût alimentaire inférieur à 35% (zone idéale).",
    formula: 'Optimaux = Articles avec (Coût alimentaire ÷ Prix) < 35%',
    example: 'Si 6 articles sur 10 ont un food cost < 35%, le compteur affiche 6.',
    interpretation:
      "Plus vous avez d'articles optimaux, meilleure est votre rentabilité. Visez au moins 70% de votre menu dans cette zone.",
  },
};
