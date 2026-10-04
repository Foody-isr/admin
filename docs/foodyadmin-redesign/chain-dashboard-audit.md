# Dashboard de chaîne — 4 octobre 2026

Route réelle `/chain/[chainId]/dashboard`, hors layout restaurant. Nouvelle branche locale `feat/admin-landing-alignment-next`, après livraison de PR#452 en développement. Ce lot n’est pas déployé.

C2 lockup, synthèse bleue et quatre indicateurs, tableau responsive par établissement, navigation clavier et retour au choix d’établissement disponible même après erreur. Nom latin isolé en bidi dans le titre RTL. Périodes aujourd’hui/semaine/mois inchangées. Les branches lentes se chargent indépendamment ; leurs échecs ne suppriment pas les autres chiffres. Zéro, absence de données et erreur sont distingués.

Le composant attend l’authentification. Les changements de chaîne/utilisateur remontent un composant neuf ; une génération de requête écarte les réponses des périodes précédentes. Les identités de la chaîne et de ses branches sont contrôlées avant les lectures par établissement.

## Contrats préservés

- `GET /chains/:id/branches`, autorisation serveur d’au moins un établissement. Liste filtrée par les accès/ownership côté serveur.
- `GET /analytics/period?chain_id=…&range=…`, sans en-tête restaurant. Les quatre agrégats viennent du serveur et ne sont pas recalculés côté interface.
- `GET /analytics/period?restaurant_id=…&range=…`, avec `X-Restaurant-ID` de la branche correspondante.
- `GET /restaurants/:id`, en-tête restaurant correspondant, pour connaître la devise réelle. Aucun contexte monétaire du restaurant précédemment ouvert n’est utilisé. Le contrat restaurant applique ILS lorsqu’une devise est absente. Une identité incohérente ou une devise malformée masque les montants concernés.
- Si les devises diffèrent, les montants restent visibles par établissement ; seuls le chiffre d’affaires et le panier moyen globaux sont masqués avec une explication. Aucune conversion inventée. Les comptes restent ceux du rapport global.

Le service analytics filtre les branches via les IDs du JWT, tandis que l’overview accepte également l’ownership. Cette différence serveur préexistante peut produire un périmètre différent avec un JWT ancien ; aucune correction ni garantie serveur ajoutée ici. Les dates et agrégations serveur sont inchangées.

## Preuves

17 scénarios Playwright isolés en mode développement : FR mobile375, HE sombre1440, EN tablette768, clavier/liens, chaîne7, erreurs403/503/malformed, reprise, détail partiel/lent, changement rapide de période, EUR commune, mélange ILS/EUR, devise inaccessible, absence de branches, vrais zéros, visite anonyme, identifiant invalide, nom long à320px et police20px. 3 tests unitaires de validation des réponses/identités/devises. Types et lint ciblé passent. i18n :6670 clés FR/EN/HE synchronisées.

Captures FR et HE inspectées, puis alignement RTL corrigé. Résultats `evidence/chain-dashboard-dev-results.json`. Le build compilé passe17/17 scénarios (9,3s). Lint complet, types, build et632 tests unitaires réussissent ;20 avertissements lint préexistants. Résultat `evidence/chain-dashboard-compiled-results.json`. Aucune API métier réelle utilisée ; toutes les écritures sont refusées dans le harnais.

## Limites restantes

Pas de conversion entre devises, pas d’export ni de nouveau graphique ajouté. Une reprise recharge le rapport et les détails. Les API partagées ne proposent pas d’annulation/timeout ici ; une lecture durablement en attente peut encore nécessiter un rechargement. Les agrégats réels, les fuseaux horaires de branches et le périmètre des JWT demandent une vérification serveur dédiée. Cette route reste partielle dans l’inventaire.
