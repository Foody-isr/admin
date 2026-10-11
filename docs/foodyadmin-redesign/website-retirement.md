# Retrait des éditeurs Website historiques

Décision utilisateur du4 octobre2026 : Website et Website V2 ne sont plus pertinents et peuvent être supprimés entièrement. Lecture des dépendances : navigation principale et lien Image de marque pointent déjà vers Website V3. Aucune entrée de navigation ni import extérieur vers les pages retirées trouvé dans src/tests/scripts. Ceci est une vérification du code local, pas une mesure d’usage en production.

Suppression des5 fichiers des deux routes (pages/layouts et templates legacy), plus8 composants exclusivement utilisés par ces éditeurs : CheckoutPreviewIframe, NavbarPanel, PageCommerce, PageCommercePanel, SelectionOverlay, BannerDesignerPanel, BrandingPanel, CoverBackgroundEditor. Les composants encore importés par V3 ou les QR sont conservés : SectionEditors, CheckoutEditor, ConfirmationEditor, OrderPageInfoEditor, CoverFocalPicker, ThemesPanel, TypographyPanel, FontSelect, FontUploadPanel, MyFontsManager. Aucun endpoint ni donnée serveur/site publié supprimé.

Deux redirections HTTP307 dans next.config.js préservent restaurant et query vers Website V3. Les anciens wrappers plein écran ont été retirés du layout ; le garde settings.edit est appliqué à la destination V3 comme pour l’ancien éditeur et la navigation. README actualisé. Les anciens plans de conception dans docs/superpowers restent historiques.

Traiteur6 et Tournées reportés ; aperçus design-system conservés comme outils dev-only et exclus du périmètre produit. Inventaire102 historique,91 routes actives dont79 documentées et12 restantes.

Validation achevée : suite unitaire, lint, types, compilation et7 scénarios isolés de redirection/scoping/permissions et404 des aperçus internes en production. La refonte visuelle complète de V3 reste un lot distinct à réaliser.


## Retrait Website/V2 — vérification achevée

629 tests unitaires passent ; lint avec20 avertissements préexistants restants (23 avant suppression), types et compilation réussis. Aucun import src alias non résolu. Le manifeste de compilation ne contient que website-v3 parmi les éditeurs. Les7 scénarios compilés réussissent sans échec/skip/flaky : redirections307 et conservation des query/restaurant2, accès au V3 existant sans écriture, refus sans settings.edit et404 des deux aperçus internes. Début2026-10-04T16:01:19.270Z, durée3288ms. Preuve `evidence/website-retirement-compiled-results.json`, journaux `/tmp/foody-website-retirement-{unit,lint,types,build,compiled}.log`.

Cette passe prouve le retrait et la compatibilité des accès ; elle ne constitue pas la refonte visuelle de V3, toujours à réaliser. Le global505 et les lots précédents restent des checkpoints séparés. Aucun appel métier réel, commit, push ou déploiement.
