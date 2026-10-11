# Premier lot à vérifier en développement

Publication en développement demandée explicitement par l’utilisateur le4 octobre2026, puis poursuite de la refonte. Branche source `feat/admin-landing-alignment`, base `bd3b4d9a`. Une PR vers develop ; aucune publication production demandée.

Le lot comprend les fondations FoodyLanding locales (Manrope/Heebo, tokens clair/sombre, nouveaux wordmark/symbole C2), navigation/primitives et les79 types de routes documentés individuellement. Leur finition exhaustive n’est pas revendiquée ; surfaces.json et known-issues.md décrivent la portée réelle.

Website historique et V2 retirés avec redirections vers V3. Traiteur6 et Tournées reportés ; V3, chaîne, livraisons/production, plans de salle et QR restent dans les12 types de pages produit à traiter. Les deux aperçus design-system restent des outils dev-only. L’ébauche Tournées est une archive locale non versionnée, exclue du commit.

Vérifications sur les sources du lot :629 tests unitaires,16 tests de dépendance,6662 clés i18n synchronisées ; lint20 avertissements préexistants, types et build réussis. Audit npm :0 vulnérabilité. Dernier passage global Playwright505/505 ; lots ciblés ultérieurs documentés séparément, dont74/74 paramètres/matériel et7/7 retrait des éditeurs. Aucun total global plus récent n’est revendiqué. Toutes les API des scénarios sont synthétiques.

Les contrats serveur et mécanismes de paiement/publication restent ceux existants. Les limites du serveur sans idempotence/ETag, des parcours partiels et de la vérification par fixtures sont documentées ; la validation du vrai environnement de développement reste à faire avec l’utilisateur. Les tarifs de facturation existants ont été conservés, sans reprendre les tarifs marketing divergents.

PR#452 fusionnée, CI et déploiement de développement vérifiés ; détails ci-dessous.


## Premier lot publié en développement

Demande utilisateur explicite exécutée : commit `fe74c937ead44aa74c321aaaa4553dfab5a73052`, PR https://github.com/Foody-isr/admin/pull/452 fusionnée dans develop le2026-10-04 à16:11UTC (19:11Asia/Jerusalem), merge `2c1bede1b5ef2039037c07626f8d2d1bf8ea3173`. Arbre de fusion identique au commit validé. CI GitHub Audit/Test/Build et i18n réussis, prévisualisation Vercel réussie.

Déploiement develop Vercel réussi, GitHub deployment6843408543, environnement Preview, URL https://admin-4ueehmmrc-mickaz.vercel.app. Adresse utilisateur https://dev-admin.foody-pos.co.il/login :HTTP200, écran FR rendu dans Chromium isolé, Manrope/Heebo chargés, champs email/mot de passe présents, aucune erreur runtime ni écriture. Favicon servi identique à la source fusionnée. Preuves `evidence/development-login-fr.png` et `evidence/development-login-verification.json`. Aucun parcours authentifié ni mutation métier réelle exécuté pour cette vérification.

Suite locale sur `feat/admin-landing-alignment-next`, depuis le merge develop. Aucun push ultérieur de cette suite avant nouvelle demande de publication. Les12 types de pages restants et finitions transversales continuent ; Traiteur/Tournées demeurent reportés.

## Deuxième lot UX — candidat développement

Nouvelle publication en développement demandée par l’utilisateur après validation du sélecteur de colonnes Articles et du retrait du logo dans la navigation. Le lot comprend les fondations monochromes, les tableaux et filtres partagés, les paramètres intégrés dans la navigation globale, les pages de chaîne terminées, les colonnes Articles personnelles et le favicon C2 noir.

La feuille de production en cours (page, composants, hooks, normalisation API et traductions associées) et l’ébauche Tournées sont exclues du commit. Elles sont préservées dans le worktree local. Le client API existant est conservé dans ce candidat.

Validation effectuée dans une copie exacte de l’index, sans les ébauches exclues : lint réussi avec 20 avertissements préexistants, TypeScript et build réussis, 640 tests unitaires, 16 tests de dépendance (installation partagée inchangée), audit npm sans vulnérabilité, 6 717 clés i18n synchronisées et 70 scénarios navigateur compilés réussis. Preuve : `evidence/ux-reference/development-candidate-results.json`. Les scénarios sont entièrement synthétiques ; cette vérification ne réalise aucune mutation métier réelle.

La publication passe par une unique PR de `feat/admin-landing-alignment-next` vers `develop`, suivie du déploiement Vercel natif. Le résultat CI et le déploiement doivent être vérifiés avant d’annoncer la disponibilité en développement. Aucune publication en production n’est incluse dans cette demande.
