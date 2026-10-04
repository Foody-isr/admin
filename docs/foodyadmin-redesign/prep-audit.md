# Préparations — audit avant migration individuelle

Lecture le 4 octobre 2026. Cette route ne sera comptée comme migrée qu’après implementation et vérification de ses surfaces. Les fonctions comparables consultées sont `StockItemEditor`, `StockTransactionDialogs`, `RecipeImportModal` et les dialogues fournisseurs.

## Surfaces

- Liste : recherche, tri, sélection et suppression groupée, filtres/KPI/catégories, accès direct `?edit=`, import recette partagé. Le chargement actuel n’affiche pas ses erreurs et peut écraser un établissement plus récent ; ajouter la garde et préserver les données chargées pendant une reprise. Les suppressions requièrent confirmation et mémoire des identifiants déjà supprimés.
- Éditeur : détails, rendement, stock, durée de conservation, catégorie, notes, statut, ingrédients et conversions, instructions/durée, ajout/remplacement via picker, import, duplication et suppression. Le chargement transforme certaines erreurs en recettes vides, puis permet la sauvegarde ; empêcher cette perte. Chaque étape de sauvegarde (fiche, ingrédients, instructions, métadonnées) doit garder son reçu et la nouvelle identité lors d’une reprise. Préserver les images des instructions existantes dans le payload, actuellement omises. Ne pas qualifier d’« frais » le simple statut actif. Le bouton « Archiver » appelle un DELETE ; rendre le libellé fidèle.
- Production : quantité, aperçu des consommations et pénuries, confirmation. Bloquer un aperçu périmé après modification ; ne pas répéter la production confirmée si le GET suivant échoue. Montrer les quantités par unité et empêcher le calcul infini en absence de rendement.
- Perte/ajustement : le client transmet actuellement `-qty` pour les deux modes. Préserver cette sémantique, expliquer que la quantité est retirée, montrer le résultat borné à zéro, conserver les notes en erreur.
- Plan quotidien : remplacer l’overlay artisanal par le dialogue partagé, garde de requête quand le jour change, erreur/reprise distinctes de l’absence de recommandations, tableau défilant sur petit écran.

## Contrats serveur, lecture seule

`foodyserver/cmd/server/main.go:1797–1830` : scope restaurant et `kitchen.manage` sur les mutations et l’aperçu de production ; lectures séparées.

`foodyserver/internal/prep/service.go` :

- `UpdateItem` (160) n’écrit la quantité que si elle est strictement positive. Une quantité zéro saisie dans l’éditeur d’une préparation existante ne remet donc pas le stock à zéro. Ne pas prétendre avoir enregistré ce zéro ; conserver le contrat et expliciter la limite ou orienter vers l’ajustement.
- `DeleteItem` (195) est une suppression logique.
- `PreviewBatch` (344) dépend du rendement positif et des ingrédients ; `ProduceBatch` (388) valide quantité positive et pénuries puis écrit consommations et production. Le client ne garantit aucune idempotence après réponse perdue.
- `CreateTransaction` (524) accepte `adjust` positif ou négatif côté serveur mais le client existant expose une déduction. Le stock final est borné à zéro ; le mouvement garde le delta demandé.
- `SetSteps` (982) remplace toutes les instructions et accepte `image_url`. `UpdateRecipeMeta` conserve durée et notes.

La durée de conservation dans la liste est estimée à partir de `updated_at`, pas d’un suivi réel de lots. Ne pas présenter ces statuts comme une DLC certifiée ou changer silencieusement leur calcul. La valorisation utilise le coût courant transmis par l’API.

## Implémentation et vérification

Le checkpoint compilé 281 inclut 17 scénarios dédiés passants. Les surfaces listées ci-dessus utilisent désormais les primitives partagées ; garde de chargement par établissement, erreurs distinctes du vide, recettes bloquantes, reçu par phase et confirmations de sortie/suppression. La quantité zéro sur une fiche existante est explicitement refusée avec orientation vers l’ajustement ; les images des étapes sont transmises. Les estimations de conservation utilisent toujours `updated_at` avec une explication visible. La catégorie partiellement créée garde son identifiant pendant la reprise.

La mémoire des réponses confirmées ne fournit pas d’idempotence durable après réponse perdue. Aucune mutation réelle n’a été effectuée. Les ajustements exposés restent négatifs ; aucune correction du moteur métier.
