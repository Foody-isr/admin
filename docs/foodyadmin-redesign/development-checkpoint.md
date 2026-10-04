# Premier lot à vérifier en développement

Publication en développement demandée explicitement par l’utilisateur le4 octobre2026, puis poursuite de la refonte. Branche source `feat/admin-landing-alignment`, base `bd3b4d9a`. Une PR vers develop ; aucune publication production demandée.

Le lot comprend les fondations FoodyLanding locales (Manrope/Heebo, tokens clair/sombre, nouveaux wordmark/symbole C2), navigation/primitives et les79 types de routes documentés individuellement. Leur finition exhaustive n’est pas revendiquée ; surfaces.json et known-issues.md décrivent la portée réelle.

Website historique et V2 retirés avec redirections vers V3. Traiteur6 et Tournées reportés ; V3, chaîne, livraisons/production, plans de salle et QR restent dans les12 types de pages produit à traiter. Les deux aperçus design-system restent des outils dev-only. L’ébauche Tournées est une archive locale non versionnée, exclue du commit.

Vérifications sur les sources du lot :629 tests unitaires,16 tests de dépendance,6662 clés i18n synchronisées ; lint20 avertissements préexistants, types et build réussis. Audit npm :0 vulnérabilité. Dernier passage global Playwright505/505 ; lots ciblés ultérieurs documentés séparément, dont74/74 paramètres/matériel et7/7 retrait des éditeurs. Aucun total global plus récent n’est revendiqué. Toutes les API des scénarios sont synthétiques.

Les contrats serveur et mécanismes de paiement/publication restent ceux existants. Les limites du serveur sans idempotence/ETag, des parcours partiels et de la vérification par fixtures sont documentées ; la validation du vrai environnement de développement reste à faire avec l’utilisateur. Les tarifs de facturation existants ont été conservés, sans reprendre les tarifs marketing divergents.

PR, CI et déploiement : en cours ; les liens et le résultat seront ajoutés au suivi après vérification.
