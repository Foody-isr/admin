# Vérifications — 4 octobre 2026

## Priorité actuelle : gabarit Square et refonte UX

Le dernier lot local remplace la direction précédente par le gabarit de tableaux et la navigation intégrée demandés dans les captures Square. **189 scénarios navigateur ciblés et 641 tests unitaires passent ; lint, types et build réussissent.** Portée, preuves et limites dans [ux-reference-audit.md](ux-reference-audit.md). Les compteurs et choix visuels des sections ci-dessous sont des checkpoints historiques ; ils ne prouvent pas une migration exhaustive selon cette nouvelle direction. Le nouveau lot n’est pas déployé.

## Données cuisine et redirections — checkpoint compilé 307

Lint (23 avertissements), types et build réussis avec exit 0 ; 597 tests unitaires ; 6 141 clés FR/EN/HE synchronisées. **307 scénarios passent**, 0 échec/skip/flaky. Début 2026-10-04T07:50:49.194Z, durée 366695.636 ms. Résultat courant `evidence/playwright-results.json`, précédent conservé dans `evidence/playwright-checkpoint-291.json`.

Onze scénarios Données cuisine et cinq redirections complètent les 291 existants. Trois tests adjacents de Données cuisine passent également. Reprises après écritures confirmées, validations de fichiers et paramètres, remplacement d’import, quantités zéro, permissions, simulation et liens directs. Les captures ciblées FR mobile et HE sombre ont été inspectées ; captures compilées de la revue FR mobile et HE sombre effectivement inspectées. API isolée uniquement, aucun traitement métier réel. Le serveur local ne contient pas l’implémentation du contrat data-workspace ; cette limite est conservée dans l’audit.

## Comparateur — checkpoint compilé 291

Lint (23 avertissements), types et build réussis avec exit 0 ; 597 tests unitaires ; 6 139 clés i18n synchronisées. **291 scénarios passent**, 0 échec/skip/flaky, début 2026-10-04T07:30:15.325Z, durée 331168.95399999997 ms. Précédent conservé dans `evidence/playwright-checkpoint-281.json`.

Neuf nouveaux scénarios comparateur couvrent FR/HE, focus des dialogues, calcul TVA/variante, erreur/reprise, normalisation URL, article absent, classement des données invalides, lecture seule et réponse périmée. Un scénario vérifie l’aide mobile persistante des préparations. Les captures compilées mobile du comparateur et de son détail ont été inspectées ; le HE sombre avait été inspecté au ciblage, ainsi que les instructions latines RTL corrigées.

## Préparations — checkpoint compilé 281

Validation complète exit 0 : lint (23 avertissements), types et build ; 597 tests unitaires ; 6 134 clés synchronisées FR/EN/HE. **281 scénarios Playwright passent**, sans échec, skip ni flaky. Début : 2026-10-04T07:13:39.653Z ; durée : 337074.592 ms. Les preuves courantes sont dans `evidence/playwright-results.json`, le checkpoint 264 est conservé séparément.

17 nouveaux scénarios : FR/HE et mobile, chargement recette bloquant, sauvegarde par phases et images, duplication, impossibilité serveur d’enregistrer zéro, sélecteur ajout/remplacement, production et reprise sans double consommation, pénuries/aperçu, ajustement négatif, plan quotidien et réponse périmée, suppression partielle, lecture seule, nouvelle fiche partiellement enregistrée, catégorie renommée sans recréation, erreurs de liste et valorisation non arrondie à l’unité, rendement zéro. Toutes les mutations sont synthétiques. Captures du formulaire FR, recette HE sombre, liste FR, plan et production effectivement inspectées.

La matrice globale de zoom/contrastes, le clavier virtuel et le serveur réel restent hors validation. Les finitions constatées sur la densité mobile et le texte latin RTL seront vérifiées au prochain checkpoint.


## Fournisseurs et commandes — checkpoint compilé 264

Validation complète exit 0 : lint (23 avertissements), types et build ; 597 tests unitaires ; 6 120 clés i18n synchronisées. **264 scénarios Playwright passent sur le build compilé**, aucun échec/skip/flaky. Début : 2026-10-04T06:43:46.753Z ; durée : 316034.892 ms. Résultat courant `evidence/playwright-results.json`, précédent conservé dans `playwright-checkpoint-245.json`.

19 nouveaux scénarios : fournisseurs et produits, chargements et permissions, brouillons, suppressions/annulation, unités et cartons, garde de changement de fournisseur, dates, création puis envoi, réception 0/partielle, préparation traduite, WhatsApp simulé et e-mail intercepté. Les reprises de GET ne répètent pas les mutations confirmées. Les photos d’écran FR mobile, HE sombre et EN incluent les listes, formulaires, compositeur, réception et envoi. Le contexte d’URL est conservé entre onglets. **44/102 routes** ont une migration individuelle documentée, souvent partielle ; 58 restent inventoriées.

Aucun envoi externe réel ni garantie d’idempotence après réponse serveur perdue. Les images et documents synthétiques servent uniquement au contrôle du client. Les préparations sont le lot suivant, non inclus dans ce checkpoint.

## Livraison, voix et historique — checkpoint compilé 245

Validation complète exit 0 : lint (23 avertissements), types et build ; 597 tests unitaires ; 6 111 clés i18n synchronisées. **245 scénarios Playwright passent sur le build compilé**, 0 échec/skip/flaky. Début : 2026-10-04T06:03:41.293Z ; durée : 295385.324 ms. Résultat dans `evidence/playwright-results.json` ; précédent conservé dans `playwright-checkpoint-227.json`.

Les 18 nouveaux scénarios couvrent revue scan FR/HE, lignes signalées, brouillon et document, justificatif manquant, import confirmé repris sans double écriture, analyse interrompue, fichiers, note vocale simulée (envoi, reprise, fermeture, accès refusé/tardif), historique/filtres/détail/documents FR/HE, suppression de brouillon, permissions et erreurs/rechargement. La reprise de l’import depuis la production quotidienne est vérifiée. Aucun vrai microphone, extraction IA, S3 ni message fournisseur appelé.

Captures réellement inspectées : revue livraison mobile FR et HE sombre, note vocale mobile, historique/détail mobile FR et HE sombre. Le bon synthétique dans `tests/redesign/assets/` est explicitement marqué comme démonstration. Les PDF réels, l’audio réel et le serveur restent hors validation. **43/102 types de routes** ont une migration individuelle documentée, souvent partielle ; 59 restent inventoriés.

## Stock opérationnel, éditeur et CSV — checkpoint compilé 227

Validation complète exit 0 : lint (23 avertissements), types et build ; 597 tests unitaires ; 6 091 clés i18n synchronisées. **227 scénarios Playwright passent sur le build compilé**, 0 échec/skip/flaky, en 264462,312 ms. Début : 2026-10-04T05:18:45.164Z. `evidence/playwright-results.json` contient ce résultat ; le précédent est conservé dans `playwright-checkpoint-205.json`.

Les 22 nouveaux scénarios vérifient filtres et menus clavier FR/HE, récupération des chargements, suppression partielle, mouvements confirmés sans répétition, historique en lecture seule, conversions conservées, conditionnements/TVA, brouillons, création avec image partiellement enregistrée, bibliothèque d’illustrations, catégories, actions groupées et import CSV stock/catalogue. Les 205 scénarios existants repassent, notamment les consommateurs partagés catalogue et préparations.

Captures stock FR mobile et HE sombre, conversion, CSV et grand montant inspectées. La matrice globale de zoom/contrastes reste partielle. L’import de livraison et ses brouillons ne sont pas couverts par ce lot. **42/102 types de routes** ont désormais une migration individuelle documentée, souvent partielle ; 60 restent inventoriés.

## Unités et réglages de stock — checkpoint compilé de 205 scénarios

Validation complète exit 0 : lint (23 avertissements), types et build. 597 tests unitaires réussis ; 6 069 clés i18n synchronisées. **205 scénarios Playwright passent sur le build compilé**, 0 échec/skip/flaky, en 246195,192 ms. Résultat : `evidence/playwright-results.json` ; checkpoint précédent conservé dans `playwright-checkpoint-190.json`.

15 nouveaux scénarios : 6 unités (FR/HE, les deux routes, édition/conversions, chargements partiels, création en erreur, suppression, lecture seule/vide), 5 règles de disponibilité (défaut FR/HE, création, conflit de suppression, chargement/vide/lecture seule) et 4 paramètres stock (FR/HE, valeurs historiques, périmètre exact du payload, erreurs, verrou de sauvegarde, reset, garde des liens et lecture seule). Le test de reset a détecté puis confirmé la correction d’un bouton secondaire qui soumettait involontairement le formulaire.

Captures inspectées : unités FR mobile et éditeur HE sombre ; règle FR mobile et HE sombre ; paramètres stock FR mobile et HE sombre. Les onglets locaux se replient sur plusieurs lignes pour rester tous visibles à 375 px. Le seuil 0 reste affiché ; les champs masqués par « suivre le stock » conservent leur valeur. Les écritures passent uniquement par l’API synthétique.

41/102 types de routes ont une migration individuelle documentée, souvent partielle. Ce lot ajoute cinq routes, aliases inclus. Le stock opérationnel, ses mouvements et son éditeur sont le lot suivant. La matrice complète de zoom, clavier virtuel et navigation SPA reste à compléter.


## Composition et coût — checkpoint compilé de 190 scénarios

Validation complète exit 0 : lint (23 avertissements), types et build. 597 tests unitaires réussis ; 6 055 clés i18n synchronisées. **190 scénarios Playwright passent sur le build compilé**, 0 échec/skip/flaky, en 243701.685 ms. Preuve historique : `evidence/playwright-checkpoint-190.json`.

21 nouveaux scénarios : 8 sur la composition (création implicite et nouvelle fiche, ajout filtré, suppression/focus, lecture seule, groupe/erreur/reprise, limites et variantes) ; 13 sur les coûts (FR mobile/HE sombre, dialogues de calcul, préparation simulée, sauvegarde partielle, reprise de rafraîchissement, brouillons, permissions, TVA du stock, prix de variante, cas historiques/zero, KPI FR/EN/HE et espace food cost).

Captures inspectées : combo HE sombre et variantes FR mobile, ratios et simulateur HE, simulateur FR mobile, import HE corrigé avec isolation bidi. Les définitions de KPI décrivent leurs données réelles ; les libellés Actifs/Inactifs remplacent la disponibilité supposée sans changer le filtre `is_active`. Les transactions synthétiques vérifient le contrat client ; aucune écriture serveur réelle ni génération IA externe.

La disponibilité avancée, les actions de masse du catalogue, la comparaison food cost et les modules non migrés restent ouverts. Le total de routes individuellement migrées reste 36/102 : ces 21 scénarios complètent des surfaces déjà comptées.

## Images IA et import — checkpoint compilé de 169 scénarios

Validation complète réussie, exit 0 : lint (23 avertissements), types et build. 597 tests unitaires réussis. 6 008 clés i18n synchronisées. **169 scénarios Playwright passent sur build compilé**, sans échec/skip/flaky, en 207 467,157 ms. Résultat courant : `evidence/playwright-results.json`.

13 nouveaux scénarios : 5 pour l’image IA (FR mobile, HE sombre, EN laptop, reprises modèles/génération/confirmation, fichier multipart et validation) ; 8 pour l’import (FR/HE, erreurs paramètres/extraction/vide, confirmation puis reprise du rafraîchissement, sélection d’une recette parmi plusieurs, correspondance stock/nouvel ingrédient, fichier, création et remplacement de préparation). Les requêtes génératives sont interceptées : aucune image réelle ni extraction externe appelée.

Les captures de revue d’import FR mobile, HE sombre, instructions de préparation mobile et générateur HE sombre ont été inspectées. L’état actif sombre a été corrigé pour utiliser `--brand-soft` plutôt que la teinte claire statique. Le champ de fixture `buildable_count` a été corrigé en `buildable` : la capacité ne rend plus `NaN`, avec assertion navigateur. Les contrôles recette utilisent désormais l’encre orange contrastée. Le sélecteur d’ingrédients mobile est capturé avec ses résultats visibles.

Deux finitions visuelles restent relevées pour le lot suivant : isoler les nombres/unités mixtes dans les explications RTL de conversion, et retirer le titre Instructions répété dans l’import de préparation. Cela ne constitue pas une certification WCAG. La composition des combos et les sous-dialogues de coût restent ouverts.

## Éditeur existant et recette — checkpoint compilé du 4 octobre

Validation complète (`npm run lint && npx tsc --noEmit && npm run build`) réussie, exit 0. 24 avertissements de lint préexistants/restants. 597 tests unitaires réussis. Contrôle i18n : 5 970 clés synchronisées. **156 scénarios Playwright passent sur le build de production local**, sans échec/skip/flaky ; résultat courant dans `evidence/playwright-results.json`.

20 nouveaux scénarios complètent le checkpoint de 136 : 6 pour chargement/modificateurs/overrides/lecture seule, 14 pour recette, disponibilité, brouillons inter-onglets, fermeture, erreurs et reprises, quantités, multiplicateurs, identifiants recréés, recherche/retrait, création stock/préparation, permission cuisine et unité. Les fiches stock/préparation créées dans les tests et les réponses API sont entièrement synthétiques.

Les captures `existing-item-*` ont été inspectées en français mobile et hébreu sombre : modificateurs, recette/instructions, disponibilité, sélecteur d’ingrédients et création. Les rendements, quantités natives, conversions et payloads existants sont conservés. La préparation partiellement créée est reprise sans répéter le POST initial. Le tableau conserve les quantités après erreur et le scénario de multiplicateurs vérifie la seconde ligne après recréation de tous les identifiants par la première sauvegarde.

L’inspection n’inclut pas encore l’image IA, l’import de recette, la composition des combos ni tous les états avancés du stock. Ces limites restent explicitement ouvertes. Les sections suivantes conservent l’historique des checkpoints précédents.


## État consolidé après cartes, POS, groupes et création d’article

Lint complet : 24 avertissements ; types et build réussis. 597 tests unitaires réussis. 136 scénarios navigateur sur build compilé, tous réussis en 165,4 s, sans échec, skip ou flaky. Deux libellés manquants découverts par le contrôle i18n ont ensuite été corrigés : nouveau build réussi et 5 scénarios POS/food cost réussis en 6,0 s. i18n : 5 930 clés, toutes langues synchronisées. Résultats complets dans `evidence/playwright-results.json`, résultat du dernier ciblage dans `evidence/i18n-playwright-results.json`.

Les sections suivantes sont les relevés historiques de chaque lot ; les mentions « build suivant en attente » décrivent leur état à ce moment, désormais remplacé par l’état consolidé ci-dessus.


## Résultats

| Vérification | Résultat |
|---|---|
| `npm run lint` | Réussi, 26 avertissements hérités ; référence initiale : 31. Un usage image supprimé par mutualisation |
| `npx tsc --noEmit` | Réussi |
| `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080 npm run build` | Réussi, Next 15.5.26, génération des 10 pages statiques et des routes dynamiques |
| `npm test` | 597 réussis, 0 échec, 0 ignoré ; référence initiale : 594 |
| `FOODY_PREVIEW_PRODUCTION=1 npx playwright test -c playwright.redesign.config.ts` | 108 réussis sur le build de production local, 146.8 s |
| `git diff --check` | Réussi |

Le lot rotation/cartes a reçu un nouveau build puis le passage complet de 108 scénarios (146.8 s, aucun échec ni scénario ignoré). `evidence/playwright-results.json` correspond à ce passage. Les contrôles ciblés précédents sont conservés séparément.

Les 26 avertissements lint restants concernent 22 usages `<img>` et 4 dépendances de hooks. Aucun test ni assertion existants supprimés. Les trois tests unitaires ajoutés couvrent la composition des classes Tailwind et les comparaisons sans base valide.

Le lot rotation suivant a passé 11 scénarios ciblés en développement (29,1 s), les types et le lint ciblé. Résultats dans `evidence/rotation-playwright-results.json`. Il est inclus dans le build complet de 108 scénarios ci-dessus.

## Matrice navigateur

- Huit routes de calibration (dashboard, commandes, détail commande, article, listes options/modificateurs, paramètres généraux, cuisine quotidienne), chacune en FR clair 1440 px, HE sombre 1440 px, EN clair 1024 px, FR clair 375 px et HE sombre 768 px.
- Trois éditeurs options/modificateurs en FR 375 px et HE sombre 1440 px.
- Food cost en FR 375/1920 px et HE sombre 1440 px ; détail peuplé, état vide et échec de recette avec nouvelle tentative. Capture du résumé produit à 935 px pour comparaison avec la landing.
- Création de commande en FR 375 px et HE sombre 1440 px : ajout d'article, quantité, total, ouverture/fermeture du checkout. Aucune création ni transaction de paiement.
- Vue d'ensemble des rapports en FR 375 px et HE sombre 1440 px : tableau accessible du graphique et erreur avec nouvelle tentative.
- Rapports par article/client : listes et panneaux détaillés en FR 375 px et HE sombre 1440 px, navigation clavier, retour du focus, valeurs de graphique, recherche, vide et erreurs/retry.
- Équipe/rôles : FR 375 px et HE sombre 1440 px ; invitation simulée sans e-mail réel, brouillon conservé sur erreur, confirmation de retrait, lecture seule, noms système préservés et payload exact de permissions.
- Rapports de service et accès POS : mêmes configurations ; dates transmises intactes, réponse périmée ignorée, chargement distinct de zéro/vide, erreur et reprise de révocation dans le dialogue.
- Service en salle : modes au clavier, affectations, annulation, protection du brouillon, erreur/reprise et payload conservant salles/sections/tables. Reprises après erreurs de chargement sur les trois espaces équipe/rôles/salle.
- Accès secondaires : FR 375 px et HE sombre 1440 px ; liens invalides/absents, visibilité et concordance des secrets, conservation de brouillon, activation propriétaire/salarié avec payloads distincts, session du salarié supprimée, redirection et téléchargement indisponible explicite. Sélecteur multi-restaurant résilient avec reprise.
- Catégories/modificateurs/modèles d’images : FR 375 px et HE sombre 1440 px, clavier/focus, lecture seule, CRUD simulé, suppression refusée puis réussie, brouillons, image persistée immédiatement, deltas négatifs et variables de modèle intacts.
- Rotation : FR mobile et HE sombre, quatre semaines entièrement accessibles au défilement, création implicite de groupe, renommage, ajout/retrait d’article, suppression, erreurs/reprise, lecture seule, semaines dimanche/lundi et absence d’article disponible.
- Connexion erronée puis correcte, sélection d'établissement, navigation mobile avec focus piégé et restitué, rôle restreint, recherche contextuelle, changement d'établissement, retour conservant le filtre commande, erreur puis sauvegarde article, erreur puis sauvegarde paramètres, confirmation de sortie et annulation de suppression d'un jeu d'options.

Les tests de chargement surveillent les erreurs JavaScript et requêtes non couvertes sur les huit routes de calibration. Les tests d'interaction vérifient leurs résultats précis ; ils ne prouvent pas tous les comportements de chaque route.

## Isolation et limites

Les fixtures sont synthétiques et refusent toute requête non prévue. Le navigateur de test bloque les appels externes dans les scénarios authentifiés. Aucun compte client, identifiant réel, API distante ni base de production utilisés. Le prévisualiseur autonome écoute sur 127.0.0.1:18080. Les quelques écritures simulées restent en mémoire et sont perdues au redémarrage.

La vérification porte sur le client et ses requêtes. Paiements, remboursements, stock réellement persisté, imprimantes, WhatsApp, Siri, publication Website et autorisations serveur ne sont pas validés par ces fixtures. Les sous-vues non marquées dans l'inventaire restent à traiter. Le zoom navigateur, les textes agrandis et une revue WCAG complète restent à effectuer.

## Contrastes et inspection

`evidence/contrast.json` contient les rapports calculés sur les paires de tokens : tous les textes testés dépassent 4,5:1 ; les bords de contrôles dépassent 3:1 sur leur surface secondaire. Cela ne constitue pas un audit de chaque combinaison de styles legacy.

Les captures ont été réellement générées et plusieurs rendus ont été inspectés : dashboard, commandes/détail, article, éditeurs, paramètres, production, création/checkout, food cost, rapports et leurs détails, équipe, rôles, shifts, accès POS, service en salle, affectations, accès secondaires et bibliothèques catalogue. Les images présentes dans `evidence/` utilisent uniquement des noms et données de démonstration.

## Incident rencontré

Le premier passage complet en développement a donné 24/25 succès ; la route options du scénario mobile n'a plus rendu de titre pendant une saturation disque. Le serveur consignait des erreurs `ENOSPC` dans son cache Webpack. Notre serveur a été arrêté et son seul répertoire `.next` a été supprimé (environ 1,5 Go), puis recréé par le build. Le passage sur le build compilé donnait 28/28 à cette étape. Le lot courant compte désormais 108/108. Aucun fichier utilisateur extérieur au worktree n'a été nettoyé.

## Reproduction

```bash
npm ci --ignore-scripts
npm run lint && npx tsc --noEmit
npm test
NEXT_PUBLIC_API_URL=http://127.0.0.1:18080 npm run build
FOODY_PREVIEW_PRODUCTION=1 npx playwright test -c playwright.redesign.config.ts
```

Le test Playwright installe lui-même ses fixtures dans chaque contexte isolé ; le serveur de fixtures autonome n'est nécessaire que pour l'aperçu manuel. Pour cet aperçu : lancer `node tests/redesign/preview-server.mjs`, puis `npx next start --port 3103`, et ouvrir `/login`. Compte fictif : `demo@foody.test` / `demo-local`.

## Cartes et disponibilités — lot ciblé suivant

Huit scénarios Playwright réussis en développement (36,7 s), types et lint ciblé verts. Création avec reprise après échec des horaires sans doublon ; nuit 21:00–02:00 et jours absents indisponibles conformément au serveur ; échec de chargement des points de vente bloquant la sauvegarde ; points de vente inactifs sélectionnés conservés ; reprise après écriture partielle ; réorganisation clavier, annulation et échec ; filtres, duplication et lecture seule. Focus après fermeture de confirmation issu d’un menu corrigé et vérifié. Captures `menus`, `menus-list`, `menu-create`, `menu-availability`, `menu-hours` en FR mobile et HE sombre ; résultats dans `evidence/menus-playwright-results.json`. Ce lot est inclus dans le dernier build complet de 108 scénarios.

## Contenu des cartes et dialogues

Dix scénarios ajoutés et inclus dans le passage compilé de 108 tests. Cartes mobiles avec sélection multiple, tableaux desktop, groupes accessibles au clavier, réorganisation groupe/article sans drag, confirmation de retrait et retour de focus. Les trois dialogues couvrent erreur/reprise, conservation des choix et non-répétition d’étapes déjà enregistrées. Le remplacement et les ajouts d’une série future conservent les bornes de fulfillment ; le retrait en série future conserve l’article dans la série courante. Le chargement des memberships ne remplace plus une erreur par une liste vide. Les permissions de lecture seule bloquent les mutations. Captures `carte-detail`, `carte-membership`, `carte-move`, `carte-replace` FR mobile et HE sombre inspectées.

La mémorisation du focus distingue désormais le déclencheur du champ natif autofocus monté dans un dialogue. La recherche commune a été adaptée à la signature ; les scénarios globaux de recherche, drawers et confirmations restent verts.

## Présentation POS — lot postérieur au build de 108 scénarios

Huit scénarios nouveaux + deux régressions cartes réussis en développement : 10/10 en 34,0 s. Types réussis. Échec/reprise de sauvegarde avec payload exact, confirmation d’abandon, aperçu et navigation, tuiles par défaut de groupe uniquement persistées après modification, renommage séparé avec erreur/reprise, erreur de chargement et lecture seule. Captures `pos-layout`, `pos-inspector`, `pos-rename`, `pos-picker` FR 375 px et HE sombre 1440 px ; les captures du canevas et des inspecteurs ont été inspectées. L’ouverture d’un dialogue imbriqué cible le champ après montage dans la pile Radix ; les dimensions et couleurs enregistrées restent intactes. Ce lot n’est pas encore inclus dans une nouvelle compilation complète. Résultats : `evidence/pos-playwright-results.json`.

## Lot groupes de carte (après POS)

Types et lint ciblé réussis ; trois avertissements `<img>` sur les composants concernés. 13 scénarios navigateur réussis en développement (44,5 s), dont deux régressions cartes. Le formulaire, sélecteurs imbriqués, remplacement et retrait ont été inspectés en FR mobile et HE sombre. Images testées avec fichiers synthétiques ; aucune API réelle. Le nouveau lot n’est pas encore inclus dans le dernier build complet. Résultats : `evidence/group-playwright-results.json`.

## Création d’article et sélections partagées

Neuf scénarios ciblés réussis en développement (53,7 s) : reprise de création partielle, échec initial, brouillon au poids par établissement, contrat des variantes, lecture seule, stockage local indisponible, clavier et captures FR mobile/HE sombre. Les cinq configurations de calibration restent passantes. Le ciblage du radio Article/Combo a été corrigé après un échec navigateur, puis le scénario clavier a réussi. Captures et résultats : `evidence/new-item-playwright-results.json`. Lint complet : 24 avertissements ; 597 tests unitaires réussis. Build complet suivant en attente.

## Checkpoint compilé 331 — Lab

Lint/types/build réussis (exit 0), 23 avertissements. 597 tests configurés et six tests Lab ciblés réussis ; 6 160 clés FR/EN/HE synchronisées. 331 scénarios Playwright passent sans échec, skip ou flaky, début 2026-10-04T08:34:14.704Z, durée 388104.524 ms. Résultats archivés dans evidence/playwright-checkpoint-331.json. Captures Lab finales FR mobile, HE sombre et studio inspectées. Les précédents lots sont inclus. Aucun appel réel à l’IA, au micro ou au backend métier.

## Clients — checkpoint compilé 351

351 scénarios passent, 0 échec/skip/flaky ; début 2026-10-04T08:55:29.910Z, durée 889334.556 ms. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés passent, six Lab explicites du checkpoint précédent inchangés. 6 166 clés i18n. Captures compilées fiche FR mobile, liste HE sombre et fusion FR inspectées. 54/102 routes documentées, 48 encore inventoriées. Équipe et Langue sont le prochain lot. Aucune API métier réelle ni déploiement.

## Équipe et Langue — validation ciblée compilée

21/21 scénarios ciblés passent, sans échec/skip/flaky ; début 2026-10-04T09:25:24.873Z, durée 47755.552 ms. Résultat `evidence/settings-compiled-results.json`. Le dernier passage exhaustif reste le checkpoint 351 ; aucune exécution complète de 372 scénarios n’est revendiquée. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés passent ; 6 173 clés FR/EN/HE synchronisées. Captures compilées Équipe FR mobile et Langue HE sombre inspectées, complétant les vues ciblées précédentes.

États réels des invitations, chargements séparés, permissions staff.manage pour le livreur par défaut ; source de langue séparée de la revue, saisies conservées après erreur et changement de langue d’interface, sections accessibles et cibles RTL. Application partielle serveur possible et navigation SPA sans garde globale documentées dans settings-audit.md. 56/102 routes ont une migration individuelle documentée, souvent partielle ; 46 restent inventoriées. Prochain lot : import de menu.

## Import de menu — validation compilée ciblée

Validation complète exit 0 : 600 tests configurés, 6 203 clés FR/EN/HE, lint avec 23 avertissements, types et build. Les 39 scénarios Import + Équipe/Langue passent (2026-10-04T09:51:11.380Z, 89278.692 ms), puis une finition du bouton fichier et du bidi des bornes est recompilée avec succès. Les **18 scénarios Import repassent** (2026-10-04T09:55:59.576Z, 43981.918 ms), 0 échec/skip/flaky. Preuves séparées `menu-import-settings-compiled-results.json` et `menu-import-compiled-results.json`. Le dernier passage complet de toutes les routes reste le checkpoint 351, conservé ; pas de passage complet de 390 scénarios revendiqué.

Toutes les interactions d’import/IA/traductions sont synthétiques. Revue FR mobile et HE sombre, fichiers, sources, erreurs/reprises, choix de langue, retouches, double soumission, fin de requête après sortie et garde de brouillon couverts. Captures compilées de revue HE et des traductions inspectées ; la capture d’entrée FR attend désormais explicitement la fin du chargement avant son enregistrement. 57/102 routes ont une migration individuelle documentée, souvent partielle ; 45 restent inventoriées. Modèles de messages et Sécurité sont les prochains lots.

## Modèles de messages et sécurité — lot ciblé compilé

Validation complète exit 0 : 600 tests configurés, 6 218 clés FR/EN/HE, lint (23 avertissements), types et build. Dix tests draft-state supplémentaires passent explicitement. **24 scénarios compilés réussis**, dont 22 compte et deux visuels import ; aucun skip/échec/flaky. Résultat `evidence/account-settings-compiled-results.json`.

Écritures confirmées/reprises GET, saisie pendant PUT (y compris retour au baseline), traductions partielles, reset par langue, limite UTF-8 et vide volontaire, lecture seule ; clés utilisateur, support absent, suppressions, annulations et authentificateur virtuel. Captures compilées du modèle HE complet, liste mobile FR et bouton import neutre effectivement inspectées. Le dernier checkpoint global reste 351, sans additionner les passes ciblées comme une régression globale. 59/102 routes documentées, souvent partiellement migrées.

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


## Retrait Website/V2 — vérification achevée

629 tests unitaires passent ; lint avec20 avertissements préexistants restants (23 avant suppression), types et compilation réussis. Aucun import src alias non résolu. Le manifeste de compilation ne contient que website-v3 parmi les éditeurs. Les7 scénarios compilés réussissent sans échec/skip/flaky : redirections307 et conservation des query/restaurant2, accès au V3 existant sans écriture, refus sans settings.edit et404 des deux aperçus internes. Début2026-10-04T16:01:19.270Z, durée3288ms. Preuve `evidence/website-retirement-compiled-results.json`, journaux `/tmp/foody-website-retirement-{unit,lint,types,build,compiled}.log`.

Cette passe prouve le retrait et la compatibilité des accès ; elle ne constitue pas la refonte visuelle de V3, toujours à réaliser. Le global505 et les lots précédents restent des checkpoints séparés. Aucun appel métier réel, commit, push ou déploiement.


## Premier lot publié en développement

Demande utilisateur explicite exécutée : commit `fe74c937ead44aa74c321aaaa4553dfab5a73052`, PR https://github.com/Foody-isr/admin/pull/452 fusionnée dans develop le2026-10-04 à16:11UTC (19:11Asia/Jerusalem), merge `2c1bede1b5ef2039037c07626f8d2d1bf8ea3173`. Arbre de fusion identique au commit validé. CI GitHub Audit/Test/Build et i18n réussis, prévisualisation Vercel réussie.

Déploiement develop Vercel réussi, GitHub deployment6843408543, environnement Preview, URL https://admin-4ueehmmrc-mickaz.vercel.app. Adresse utilisateur https://dev-admin.foody-pos.co.il/login :HTTP200, écran FR rendu dans Chromium isolé, Manrope/Heebo chargés, champs email/mot de passe présents, aucune erreur runtime ni écriture. Favicon servi identique à la source fusionnée. Preuves `evidence/development-login-fr.png` et `evidence/development-login-verification.json`. Aucun parcours authentifié ni mutation métier réelle exécuté pour cette vérification.

Suite locale sur `feat/admin-landing-alignment-next`, depuis le merge develop. Aucun push ultérieur de cette suite avant nouvelle demande de publication. Les12 types de pages restants et finitions transversales continuent ; Traiteur/Tournées demeurent reportés.

## Lot local suivant — Dashboard de chaîne

17/17 scénarios ciblés passent sur build compilé, sans échec/skip/flaky. Lint complet (20 avertissements préexistants), types, build et632 tests unitaires réussissent. i18n :6670 clés. Captures FR mobile, HE sombre et EN tablette dans evidence/chain-dashboard-*.png ; résultat `evidence/chain-dashboard-compiled-results.json`. Ce lot local suit le déploiement PR#452 et n’est pas publié. Le dernier global demeure505/505.

## Lot local chaîne — deux routes

38/38 scénarios compilés passent (21 établissements,17 dashboard), début2026-10-04T16:47:41.014Z, durée22517ms. Lint/types/build et632 tests unitaires réussissent,20 avertissements existants. 6696 clés i18n. Résultat `evidence/chain-compiled-results.json`. Ce lot n’est pas déployé. Le dernier global reste505/505.
