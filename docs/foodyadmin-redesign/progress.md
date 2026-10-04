# Progression — 4 octobre 2026

**État actuel : refonte en cours, 79/91 types de routes dans le périmètre produit courant documentés individuellement (souvent partiels), 12 encore à traiter.** Inventaire historique102 : Traiteur6 et Tournées reportés ; Website/V2 supprimés avec redirections vers V3 ; les2 aperçus internes sont conservés hors périmètre produit. Dernier global compilé505/505 ; lot ciblé paramètres74/74. Retrait des anciens éditeurs validé :629 tests unitaires et7 scénarios compilés ; lint/types/build réussis. Premier lot autorisé pour develop : commit/PR/déploiement en préparation, puis poursuite des12 types restants.


## Cadre

Travail isolé : `foodyadmin-redesign`, branche `feat/admin-landing-alignment`, base `bd3b4d9a`. Le checkout `foodyadmin` et ses modifications cuisine sont préservés. Aucun commit, push, PR, déploiement, paiement réel ou mutation de production effectué. FoodyLanding local reste en lecture seule ; son ancien site publié n’est pas la référence.

L’intégration C2 préexistante est conservée : wordmark et symbole, icônes, accès, chargements et appareils. Le diff initial est sauvegardé dans `/tmp/foodyadmin-redesign-logo-baseline.patch`. Les sources produit inspectées sont les démonstrations POS, production et food cost de la landing locale.

## État réel

102 types de routes initialement inventoriés ; 91 restent dans le périmètre produit courant, dont79 ont reçu une migration individuelle documentée, souvent partielle. L’inventaire distingue conception, implémentation, tests fonctionnels et inspection visuelle. Une page héritant uniquement des tokens n’est pas comptée comme migrée. **La migration exhaustive n’est pas terminée.**

Fondations : polices locales Manrope/Heebo, tokens clair/sombre, C2, navigation mobile/RTL, primitives et dialogues Radix, recherche et sélection de branche.

Périmètre documenté :

- Accès : connexion, réinitialisation, activation propriétaire/salarié, sélection d’établissement.
- Pilotage : dashboard, commandes/détail/nouvelle commande, rapports globaux/articles/clients, production quotidienne et food cost principal.
- Catalogue : liste/création d’article, éditeur existant (détails, modificateurs, recette, disponibilité), catégories, options/modificateurs, modèles d’images, rotation hebdomadaire.
- Cartes : liste/création, disponibilité, détail et dialogues d’affectation, éditeur POS et éditeur de groupe (traductions, horaires, image, articles, semaines).
- Personnel : équipe, rôles, services, accès POS et affectations de salle.
- Paramètres généraux, gestion des appareils, unités, règles de disponibilité et paramètres de stock.

Dernier lot : éditeur d’article existant. Chargements récupérables, cache cloisonné par établissement, brouillons conservés après mutations immédiates et changements d’onglet, garde de fermeture. Recette : instructions accessibles, quantités conservées après erreur, sérialisation successive malgré les identifiants recréés par l’API, créations stock/préparation sans doublon lors des reprises. Disponibilité : chargement des règles avec reprise et stock conservé entre onglets. Permissions `menu.edit` et `kitchen.manage` alignées avec les endpoints de recette. FR mobile et HE sombre inspectés. Image IA et import : dialogues accessibles, fichiers validés, erreurs récupérables, aperçus conservés, revue des correspondances et transactions de confirmation sans répétition après un échec de rafraîchissement. Les imports de préparation conservent rendement, instructions et durée. Le compositeur de formules et les dialogues de coût ont reçu un lot dédié : source filtrée, règles et variantes, lecture seule, calculs FR/EN/HE et simulateur responsive. Les reprises de sauvegarde de coût conservent le brouillon et ne répètent pas les écritures confirmées.

Stock opérationnel : liste, menus/filtres et catégories partagés, mouvements/historique, suppressions/TVA/catégories groupées, éditeur (photos/illustrations, conditionnements, conversions, alias, TVA) et CSV sont validés au checkpoint compilé 227. Les reprises conservent les étapes confirmées. Le lot suivant couvre import livraison scan/voix/brouillons et historique des approvisionnements : 18 nouveaux scénarios, puis régression complète compilée de 245 scénarios réussis.

## Vérifications historiques — checkpoint351

- Lint complet et types réussis ; 23 avertissements de lint (31 au départ).
- Build de production réussi après Assistant IA et Service à table.
- 603 tests unitaires configurés ; six tests Lab ciblés du checkpoint 331 inchangés.
- 351 scénarios Playwright réussis sur build compilé, sans échec ni scénario ignoré (durée exacte dans `evidence/playwright-results.json`).
- Contrôle i18n réussi : 6 292 clés, FR/EN/HE synchronisés.
- Toutes les API des scénarios sont synthétiques et isolées. Cela ne valide ni le serveur réel, ni paiements, impressions ou messages externes.

Preuves : `evidence/playwright-results.json`, captures `existing-item-*` et références landing. Les lots ciblés historiques restent disponibles séparément. Les autres limites figurent dans `known-issues.md` et `verification.md`.

## Prochaines tâches exactes

1. Compléter les états avancés de disponibilité de l’article (poids/par variante) et l’inspection des contrastes locaux. Composition, coût, import et IA ont désormais leurs propres tests. Les finitions bidi de conversion et le titre Instructions dupliqué ont été corrigés et revus dans les captures du checkpoint 190. Les anciens scripts de composition et `/tmp/foody-cost-*.py` ont déjà été appliqués ; ne pas les réexécuter.
2. Les préparations et leurs overlays passent le checkpoint compilé 281 (17 nouveaux scénarios) ; comparateur de coûts suivant. Historique fournisseurs : fournisseurs, produits, composition/envoi/réception de bons de commande. 19 scénarios dédiés passent, puis régression compilée complète de 264 scénarios. Préparations validées ; audit et limites dans `prep-audit.md`. `supplier-audit.md` décrit les contrats et limites. Puis comparateur de coûts, Lab, clients, livraisons/traiteur/chaînes, salle/QR, paramètres secondaires et Website V3/V2/legacy. Les unités, règles de disponibilité et paramètres stock ont reçu un lot dédié après le checkpoint 190 ; checkpoint compilé 245 validé après import de livraison et historique.
3. Traiter les sous-vues restantes des routes partiellement migrées ; `surfaces.json` décrit la portée exacte. Vérifier aussi les routes de redirection et alias.
4. Terminer les parcours recherche/IA, les permissions et erreurs, le zoom et les textes agrandis. Ne pas revendiquer une conformité WCAG complète sur la base des tests actuels.

## Reprise locale

Fixtures : `node tests/redesign/preview-server.mjs` sur 18080. Preview : `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080 npx next dev --port 3103`. Compte synthétique : `demo@foody.test` / `demo-local`. Le serveur de fixtures déjà lancé doit être redémarré pour prendre les nouvelles données. Les requêtes inconnues sont refusées.

Tests dev : `npx playwright test -c playwright.redesign.config.ts`. Build : `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080 npm run build`. Tests compilés : `FOODY_PREVIEW_PRODUCTION=1 npx playwright test -c playwright.redesign.config.ts`.

Ne pas exécuter build et serveur dev sur le même `.next`. Le serveur 3103 géré par Playwright s’arrête après les tests. Le checkpoint compilé 245 est conservé. Les finitions de taille des montants mobiles et de cadrage des captures sont incluses dans le checkpoint compilé 264. Notre cache dev de ce worktree a été nettoyé avant compilation en raison de la faible place disque ; aucun autre checkout nettoyé.

Ne pas arrêter la landing originale de l’utilisateur (3001). La référence isolée reste sur 3101 depuis `/tmp/foodylanding-reference`.

## Préparations — checkpoint 281

Liste, catégories, éditeur détails/recette, import, duplication, suppression simple/groupée, sélecteur d’ingrédients, production, perte/ajustement et plan quotidien ont reçu leur migration. Les 17 nouveaux scénarios et les 264 précédents passent dans le build compilé. Les reprises gardent les phases confirmées et les images des instructions. Les quantités/conversions et la déduction existante des ajustements sont conservées. Les limites serveur (zéro et réponse perdue) sont documentées.

Captures réellement inspectées : formulaire mobile FR, recette HE sombre, liste mobile FR, plan quotidien mobile et production desktop. À améliorer dans le lot suivant : densité du haut de liste mobile et direction automatique des textes latins saisis en RTL. 45/102 routes ont une migration individuelle documentée ; 57 restent inventoriées.

## Comparateur — checkpoint 291

Neuf scénarios comparateur et un scénario d’aide mobile complètent les 281 existants, tous passants sur build compilé. Calculs partagés inchangés, erreurs/reprises, sélection valide et réponse périmée, tableau clavier/RTL, dialogues et total mobile, paramètres de retour. La densité mobile et les textes latins des instructions en RTL ont été revus. 46/102 types de routes ont une migration individuelle documentée ; 56 restent inventoriés. L’espace Données cuisine puis le Lab sont les prochains lots.

## Données cuisine et redirections — checkpoint compilé 307

Lint (23 avertissements), types et build réussis avec exit 0 ; 597 tests unitaires ; 6 141 clés FR/EN/HE synchronisées. **307 scénarios passent**, 0 échec/skip/flaky. Début 2026-10-04T07:50:49.194Z, durée 366695.636 ms. Résultat courant `evidence/playwright-results.json`, précédent conservé dans `evidence/playwright-checkpoint-291.json`.

Onze scénarios Données cuisine et cinq redirections complètent les 291 existants. Trois tests adjacents de Données cuisine passent également. Reprises après écritures confirmées, validations de fichiers et paramètres, remplacement d’import, quantités zéro, permissions, simulation et liens directs. Les captures ciblées FR mobile et HE sombre ont été inspectées ; inspection du rendu compilé en cours. API isolée uniquement, aucun traitement métier réel. Le serveur local ne contient pas l’implémentation du contrat data-workspace ; cette limite est conservée dans l’audit.

52/102 types de routes ont une migration individuelle documentée ; 50 restent inventoriés. Le Lab est en cours.

## Lab — checkpoint compilé 331

331 scénarios passent, 0 échec/skip/flaky ; 2026-10-04T08:34:14.704Z, durée 388104.524 ms. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés et six tests Lab explicites ; 6 160 clés i18n. Captures compilées FR mobile, HE sombre et studio inspectées. Autosauvegarde, file, restauration, IA/images simulées, recettes et actions coordonnées ; détails dans lab-audit.md. 53/102 routes documentées, 49 encore inventoriées. Clients est le prochain lot. Les paragraphes précédents constituent l’historique ; le checkpoint 331 inclut tous les lots antérieurs.

## Clients — checkpoint compilé 351

351 scénarios passent, 0 échec/skip/flaky ; début 2026-10-04T08:55:29.910Z, durée 889334.556 ms. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés passent, six Lab explicites du checkpoint précédent inchangés. 6 166 clés i18n. Captures compilées fiche FR mobile, liste HE sombre et fusion FR inspectées. 54/102 routes documentées, 48 encore inventoriées. Équipe et Langue sont le prochain lot. Aucune API métier réelle ni déploiement.

## Équipe et Langue — validation ciblée compilée

21/21 scénarios ciblés passent, sans échec/skip/flaky ; début 2026-10-04T09:25:24.873Z, durée 47755.552 ms. Résultat `evidence/settings-compiled-results.json`. Le dernier passage exhaustif reste le checkpoint 351 ; aucune exécution complète de 372 scénarios n’est revendiquée. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés passent ; 6 173 clés FR/EN/HE synchronisées. Captures compilées Équipe FR mobile et Langue HE sombre inspectées, complétant les vues ciblées précédentes.

États réels des invitations, chargements séparés, permissions staff.manage pour le livreur par défaut ; source de langue séparée de la revue, saisies conservées après erreur et changement de langue d’interface, sections accessibles et cibles RTL. Application partielle serveur possible et navigation SPA sans garde globale documentées dans settings-audit.md. 56/102 routes ont une migration individuelle documentée, souvent partielle ; 46 restent inventoriées. Prochain lot : import de menu.

## Import de menu — validation compilée ciblée

Validation complète exit 0 : 600 tests configurés, 6 218 clés FR/EN/HE, lint avec 23 avertissements, types et build. Les 39 scénarios Import + Équipe/Langue passent (2026-10-04T09:51:11.380Z, 89278.692 ms), puis une finition du bouton fichier et du bidi des bornes est recompilée avec succès. Les **18 scénarios Import repassent** (2026-10-04T09:55:59.576Z, 43981.918 ms), 0 échec/skip/flaky. Preuves séparées `menu-import-settings-compiled-results.json` et `menu-import-compiled-results.json`. Le dernier passage complet de toutes les routes reste le checkpoint 351, conservé ; pas de passage complet de 390 scénarios revendiqué.

Toutes les interactions d’import/IA/traductions sont synthétiques. Revue FR mobile et HE sombre, fichiers, sources, erreurs/reprises, choix de langue, retouches, double soumission, fin de requête après sortie et garde de brouillon couverts. Captures compilées de revue HE et des traductions inspectées ; la capture d’entrée FR attend désormais explicitement la fin du chargement avant son enregistrement. 57/102 routes ont une migration individuelle documentée, souvent partielle ; 45 restent inventoriées. Modèles de messages et Sécurité sont les prochains lots.

Modèles et Sécurité : validation complète réussie (600 tests configurés, 6 218 clés), dix tests draft-state ciblés, puis 24 scénarios compilés réussis (22 compte et 2 visuels import). Captures réelles longues des modèles, clés mobile et libellé neutre « Choisir un fichier » inspectés. Le checkpoint **complet** demeure 351 ; les lots ciblés suivants restent séparés. 59/102 routes documentées, souvent partielles ; 43 encore inventoriées. Notifications est le lot en cours.

## Notifications et WhatsApp — lot ciblé compilé

Validation complète exit 0 : **603 tests configurés**, **6 286 clés** FR/EN/HE, lint (23 avertissements), types et build. **39 scénarios compilés réussis**, 0 échec/skip/flaky ; début 2026-10-04T10:49:26.314Z, durée 112510.852 ms. Preuves : `evidence/notifications-whatsapp-compiled-results.json`. Captures compilées Notifications HE sombre, liste mobile FR et connexion WhatsApp mobile FR inspectées ; revue mobile et HE WhatsApp inspectés aussi au ciblage.

22 scénarios Notifications et 17 WhatsApp, tous isolés : reprises/permissions, défaut de worker, sérialisation avec réparation, phase locale après retrait serveur, aucun test push sans endpoint ; provenance Meta, brouillon/identité, perte de réponse, GET seul, double clic, déconnexion, OTP et statut périmé. Trois tests unitaires de validation supplémentaires. Les valeurs publiques de Meta/Twilio fournies au build sont synthétiques ; aucun vrai SDK, abonnement, message ou paiement appelé.

**61/102 routes** documentées, souvent partiellement migrées ; **41 encore inventoriées**. Le dernier checkpoint **global** demeure **351** ; les passes ciblées postérieures ne sont pas additionnées comme une régression globale. Audit et limites : `notifications-whatsapp-audit.md`.

## Assistant IA et Service à table — validation ciblée compilée

Validation complète exit 0 : **603 tests configurés**, **6 292 clés** FR/EN/HE, lint (23 avertissements), types et build. **19/19 scénarios compilés réussis**, 0 échec/skip/flaky ; début 2026-10-04T11:11:03.684Z, durée 38012.693 ms. Preuve : `evidence/assistance-settings-compiled-results.json`. Captures compilées Service à table FR mobile et Assistant HE sombre inspectées, avec les autres captures ciblées du lot.

Conservation des champs désactivés/masqués et valeurs historiques, reprise de chargement, double soumission, lecture seule, changement de langue, garde de brouillon et sauvegarde partielle sont couverts. Aucun appel IA ou tâche de service réel. Limites de comportement serveur documentées dans `assistance-settings-audit.md`. **63/102 routes** documentées, souvent partiellement migrées ; **39 encore inventoriées**. Le dernier passage global demeure **351** ; les passes ciblées restent séparées. Paiements et Cibus sont en cours.

## Paiements, Cibus et identité — régression globale compilée 505

**505/505 scénarios compilés réussis**, 0 échec/skip/flaky, début **2026-10-04T11:35:36.856Z**, durée **1197589.973 ms**. Résultat global actualisé `evidence/playwright-results.json`, ancien 351 conservé dans `playwright-checkpoint-351.json`. Il s’agit cette fois d’une exécution complète, incluant les lots ciblés précédents. Validation complète précédente réussie : **603 tests configurés**, **6 342 clés** FR/EN/HE, lint (23 avertissements), types et build ; journal `/tmp/foody-payment-branding-validation.log`.

Les 23 scénarios Paiements/Cibus et 12 Identité passent. Captures compilées Paiements FR bas de page, Cibus HE identifiant synthétique révélé, Identité FR bas de page et HE sombre effectivement inspectées. L’interface ne présente plus les faux réglages de fournisseurs ou de pourboires comme persistants ; les limites des contrats serveur restent explicites. Composant du nouveau logo vérifié identique à FoodyLanding local par `cmp`. Aucun paiement, publication, message ou mutation réelle.

**66/102 types de routes** ont une migration individuelle documentée, souvent partielle ; **36 restent inventoriés**. La mission complète n’est pas terminée. Le prochain lot couvre Statut des tables et Sections.

## Statut des tables et Sections — validation compilée ciblée

**16/16 scénarios compilés réussis**, 0 échec/skip/flaky ; début **2026-10-04T12:04:10.364Z**, durée **39100.579 ms**. Preuve `evidence/table-settings-compiled-results.json`. La passe dev préalable réussit également (16/16). **603 tests configurés**, **6 377 clés** FR/EN/HE, lint (23 avertissements), types et build passent ; journaux `/tmp/foody-table-unit.log`, `/tmp/foody-table-lint.log`, `/tmp/foody-table-types.log`, `/tmp/foody-table-build.log`.

Captures compilées Statut des tables HE sombre et dialogue de création FR mobile inspectées ; aperçu mobile et liste à noms longs également inspectés pendant le ciblage. Reprise de chargement, zéro, seuils historiques/inversés, sauvegarde sérialisée, garde, changement de langue, lecture seule, création partielle, renommage sans preload et suppression/reprise GET couverts. Aucun objet métier réel créé.

**68/102 types de routes** ont une migration individuelle documentée, souvent partielle ; **34 restent inventoriés**. Le dernier checkpoint **global** est **505**, conservé ; cette validation ciblée ne constitue pas une passe globale de 521 scénarios. Prochain travail précis : `settings/orders/OrdersSettingsWorkspace.tsx`, `_components.tsx` et `OrderWorkflowBuilder.tsx` ; voir `orders-settings-audit.md` pour les contrats et défauts déjà lus. L’interface de ce prochain lot reste à modifier.

## Disponibilité — validation compilée ciblée

13/13 scénarios passent, sans échec/skip/flaky ; début 2026-10-04T12:31:07.408Z, durée 24723.116 ms. Preuve `evidence/order-availability-compiled-results.json`. Lint/types/build exit 0, 23 avertissements existants ; 603 tests configurés et 6 388 clés FR/EN/HE synchronisées. La finition mobile empile les heures sous 420 px et conserve entièrement le champ natif ; captures compilées FR mobile et section semaine HE sombre réellement inspectées. Premier résultat compilé conservé séparément avant cette finition.

Disponibilité et son ancienne redirection portent le décompte à 70/102 routes documentées, souvent partielles ; 32 restent inventoriées. Les trois autres sous-vues Commandes et le hub restent à migrer. Le dernier passage global demeure 505/505 ; les lots salle 16/16 et Disponibilité 13/13 sont des exécutions ciblées séparées. Aucun passage global de 534 scénarios revendiqué. Wordmark et symbole C2 conservés, composant identique à la landing locale. Aucun service externe ni déploiement.

## Traitement + Disponibilité — validation compilée ciblée

27/27 scénarios passent, sans échec/skip/flaky ; début 2026-10-04T12:52:40.772Z, durée 57787.454 ms. Résultat `evidence/order-processing-availability-compiled-results.json` : 14 Traitement et les 13 Disponibilité précédents. Lint/types/build exit0 (23 avertissements existants), 603 tests configurés, 6 399 clés synchronisées. Captures compilées détails FR mobile (actions réunies et texte entier) et cartes HE sombre réellement inspectées.

Le décompte reste 70/102 routes documentées, souvent partielles : Traitement complète une sous-vue de la route [section] déjà comptée. 32 routes restent inventoriées, Précommandes/Parcours et hub encore hérités. Le dernier passage global demeure 505 ; aucune régression globale de 548 scénarios revendiquée. Prochain lot Précommandes.

## Précommandes et réglages associés — 44 ciblés compilés

44/44 scénarios passent, sans échec/skip/flaky, début 2026-10-04T13:08:24.613Z, durée 72550.40800000001 ms. Preuve `evidence/order-preorders-compiled-results.json` : 17 Précommandes, 14 Traitement, 13 Disponibilité. Lint/types/build exit0, 23 avertissements existants ; 6 417 clés FR/EN/HE synchronisées. Dernier passage des 603 tests configurés : lot Traitement précédent ; pas de nouvelle exécution unitaire revendiquée. Les modifications depuis concernent le formulaire et ses tests isolés. Captures compilées aperçu FR et HE sombre, délai90 minutes mobile FR réellement inspectées.

Premier lot compilé42/44 conservé : sélecteur de lien Disponibilité ambigu après ajout d’une aide et matcher d’option native disabled incorrect ; fixtures corrigées, aucun correctif source nécessaire. Capture HE recentrée pour voir toutes les dates. La redirection scheduled-orders ajoute une route : 71/102 types documentés, souvent partiels, 31 encore inventoriés. Dernier global toujours505 ; lots ultérieurs séparés (salle16 puis commandes44), pas de global565 revendiqué. Hub et Parcours suivants.


## Commandes — 75 scénarios compilés

75/75 réussis, 0 échec/skip/flaky ; début 2026-10-04T13:31:51.837Z, durée 60269.684 ms. Preuve `evidence/orders-complete-compiled-results.json` : Disponibilité13, Traitement14, Précommandes17, Aperçu11, Parcours20. Lint (23 avertissements existants), types et build passent, 603 tests unitaires passent, 6 454 clés FR/EN/HE synchronisées. Journaux `/tmp/foody-workflow-{unit,i18n,lint,types-compiled,build}.log`. Captures compilées de récupération FR et édition HE réellement inspectées, complétant les captures dev et précédentes.

Hub et ancienne redirection Parcours portent le décompte à73/102 routes individuellement documentées, souvent partielles ;29 encore inventoriées. Les quatre sous-vues Commandes sont désormais traitées. Le dernier passage global reste505 ; les75 constituent une validation ciblée et ne sont pas présentés comme une exécution globale. Aucun service réel sollicité.

Une nouvelle comparaison à la landing locale révèle un ajustement récent du symbole dans la variante combinée : translate(0,11) devient translate(0,25), géométries wordmark/symbole inchangées. Cet ajustement est repris après le checkpoint75. Les vues testées emploient wordmark et symbole séparés, donc le rendu testé n’est pas modifié. Composant à nouveau identique à la landing ; prochaine compilation avec Facturation.


## Facturation, Stories et non-régression WhatsApp —53 compilés

53/53 scénarios réussis, 0 échec/skip/flaky ; début2026-10-04T13:55:17.718Z, durée47142.612ms. Facturation12, Stories24, WhatsApp17. Résultat `evidence/billing-stories-whatsapp-compiled-results.json`. Lint avec23 avertissements existants, types et build passent ;603 tests configurés passent,6 509 clés FR/EN/HE synchronisées. Journaux `/tmp/foody-billing-stories-{unit,i18n,lint,types,build}.log`. Captures compilées confirmation forfait FR et bibliothèque Stories HE réellement inspectées ; les vues dev FR mobile et HE sombre complètent les preuves.

Les connexions/paiements/médias sont intégralement synthétiques. Aucun compte réel, aucune mutation métier réelle ni déploiement. Composant C2 comparé de nouveau identique à la landing locale après incorporation de l’ajustement du logo combiné. Différence des gammes/tarifs de facturation et landing explicitement documentée sans modification du contrat financier.

75/102 types de routes individuellement documentés, souvent partiels ;27 encore inventoriés. Dernier checkpoint global505 conservé ; les lots ultérieurs ciblés restent distincts. La refonte exhaustive n’est pas terminée. Prochain lot : Codes promotionnels, audit déjà écrit dans discounts-audit.md ; aucun code de ce lot encore changé.


## Codes promotionnels —23 scénarios compilés

23/23 passent, 0 échec/skip/flaky ; début2026-10-04T14:31:20.674Z, durée19828.627ms. Preuve `evidence/discounts-compiled-results.json`. Lint23 avertissements existants, types/build réussis,612 tests configurés passent et6 554 clés FR/EN/HE synchronisées. Les vérifications TypeScript intermédiaires ont identifié le rétrécissement de type manquant dans la fixture commune (plusieurs formes de restaurant) ; corrigé avec garde et Object.assign, sans changement du comportement testé. Journaux `/tmp/foody-discounts-{unit,i18n,lint,types-release,build,compiled}.log`. Captures compilées liste HE et conditions FR mobile réellement inspectées ; aucune troncature de code standard, dates inclusives conservées.

76/102 types de routes documentés individuellement, souvent partiels ;26 encore inventoriés. Le dernier passage global reste505 ; les23 scénarios constituent une validation ciblée distincte. Aucun service réel ni déploiement. Appareils en préparation, audit devices-audit.md ; prochaine modification de source après ce checkpoint.


## Appareils — 22 scénarios compilés

22/22 passent, 0 échec/skip/flaky ; début 2026-10-04T14:49:03.670Z, durée 27618.733 ms. Preuve `evidence/device-inventory-compiled-results.json`. Validation complète réussie : 616 tests configurés, 6 583 clés FR/EN/HE, lint (23 avertissements existants), types et build. Journaux `/tmp/foody-device-inventory-{unit,i18n,lint,types,build,compiled}.log`. Captures compilées liste mobile FR (filtres repliables) et détail HE sombre avec symbole C2 réellement inspectées.

Le premier ciblage a révélé une incompatibilité du garde de route générique avec les permissions matérielles du backend ; corrigée dans le garde et la navigation, sans élargir les autres routes. Les 22 scénarios couvrent inventaire/détails, actions par capacités cumulées, polling sans écrasement du brouillon, renommage, suppressions partielles, file et tests, réponse perdue, lecture seule, mobile, locale et restaurant actif. Aucun matériel réel sollicité.

77/102 types de routes documentés individuellement, souvent partiels ; 25 encore inventoriés. Le dernier checkpoint global reste 505 ; ces 22 tests sont une exécution ciblée séparée. Profils d’impression est le prochain lot.


## Profils d’impression — 25 scénarios compilés

25/25 passent, 0 échec/skip/flaky ; début 2026-10-04T15:11:51.285Z, durée 30644.091 ms. Preuve `evidence/printer-profiles-compiled-results.json`. Validation complète : 621 tests configurés réussis, 6 611 clés FR/EN/HE, lint23 avertissements existants, types et build réussis. Journaux `/tmp/foody-printer-{unit,i18n,lint,types,build,compiled}.log`. Un scénario compilé supplémentaire reprend la capture d’affectations après attente de fin de transition, sans changement source (`printer-profiles-capture-compiled-results.json`).

Captures réellement inspectées : éditeur FR mobile pendant ciblage ; listes compilées FR mobile et HE sombre, affectations compilées après fin de transition. Le mauvais token de contraste sur le nom en thème sombre a été corrigé avant la passe finale. Premier ciblage10/21 conservé : libellés/assertions inadaptés et double montage React dev, corrigés ; quatre scénarios de récupération ajoutés puis25/25 dev.

78/102 types de routes documentés individuellement, souvent partiels ; 24 encore inventoriés. Dernier global505 conservé ; les25 sont une passe ciblée séparée. Prochain lot : Zones de livraison, contrats et risques décrits dans delivery-zones-audit.md. Aucun appel réel de matériel, déploiement ou écriture serveur métier.


## Zones de livraison — validation compilée et régression paramètres

**74/74 scénarios ciblés compilés passent** : Zones de livraison27, Appareils22, Profils d’impression25. Début2026-10-04T15:43:56.141Z, durée85550.501ms, zéro échec/skip/flaky. Preuve `evidence/delivery-hardware-compiled-results.json`. Validation complète réussie :628 tests unitaires,6662 clés FR/EN/HE, lint23 avertissements existants, types et build. Journaux `/tmp/foody-delivery-zone-{unit,i18n-final,lint,types,build}.log` et `/tmp/foody-delivery-hardware-compiled.log`. Le global505 reste séparé et inchangé.

Cartes compilées réellement inspectées dans l’éditeur FR375 et la liste HE1440, confirmation de dernière zone active FR. Fond et géocodage simulés explicitement ; aucune adresse réelle. Le premier ciblage interrompu pour une erreur de remontage Leaflet est archivé, le deuxième23/24 pour un libellé de test inexact ; finaldev27/27. Le cycle natif Leaflet est maintenant possédé par un effet avec nettoyage, le contexte React Leaflet utilise la dépendance déjà installée @react-leaflet/core2.1.0 désormais déclarée directement. Aucun remplacement de bibliothèque.

Origine d’un rayon existant préservée lors d’un changement de tarif, remplacement explicite, anciennes géométries conservées. Minimum global séparé et soumis aux permissions settings ; zones sous orders.manage. Reprises après réponse perdue par lecture seule, garde de brouillon, erreurs et états sans fausse liste vide.

79/102 types de routes documentés individuellement, souvent partiels ;23 encore inventoriés. Tournées est le prochain lot. Pas de commit, push, déploiement ni API métier réelle.


## Périmètre resserré par l’utilisateur — 4 octobre2026

Website historique et V2 supprimés à sa demande, sous réserve des vérifications documentées dans website-retirement.md. Traiteur branches/événements/devis/routing/services/détail et Tournées reportés. L’ébauche non validée de Tournées a été archivée dans `deferred/delivery-tours-unvalidated.patch`, la page de travail restaurée exactement à la version pré-lot (HEAD identique au checkout original). Ne pas réappliquer cette ébauche sans reprise explicite du périmètre.

Les aperçus `/design-system` et `/design-system/order-detail` sont des outils de développement existants, protégés par notFound en production. Conservés, pas comptés comme pages client restantes. Aucun travail Traiteur/Tournées à poursuivre dans la passe courante.

Restent12 types à traiter : chaîne branches/dashboard2 ; commandes mode livreur/livraisons/production3 ; plans de salle liste/création/édition3 ; QR gestion/personnalisation/impression3 ; Website V3. Puis finitions des surfaces partielles et validation transversale. Les mentions historiques « prochain lot Tournées » plus haut sont désormais obsolètes.


## Retrait Website/V2 — vérification achevée

629 tests unitaires passent ; lint avec20 avertissements préexistants restants (23 avant suppression), types et compilation réussis. Aucun import src alias non résolu. Le manifeste de compilation ne contient que website-v3 parmi les éditeurs. Les7 scénarios compilés réussissent sans échec/skip/flaky : redirections307 et conservation des query/restaurant2, accès au V3 existant sans écriture, refus sans settings.edit et404 des deux aperçus internes. Début2026-10-04T16:01:19.270Z, durée3288ms. Preuve `evidence/website-retirement-compiled-results.json`, journaux `/tmp/foody-website-retirement-{unit,lint,types,build,compiled}.log`.

Cette passe prouve le retrait et la compatibilité des accès ; elle ne constitue pas la refonte visuelle de V3, toujours à réaliser. Le global505 et les lots précédents restent des checkpoints séparés. Aucun appel métier réel, commit, push ou déploiement.
