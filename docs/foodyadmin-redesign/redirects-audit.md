# Routes de redirection

Inspection individuelle : analytics → analytics/overview, kitchen → kitchen/daily-operations, menu → menu/items, orders → orders/all, racine → login. Les quatre aliases restaurant partagent désormais RestaurantRedirect : même restaurant, query complète conservée (y compris clés répétées), remplacement de l’historique, statut de chargement et symbole C2 existant. Les destinations restent identiques. La racine garde sa redirection serveur vers la connexion déjà refondue.

Cinq tests ciblés passent en développement (39,5 s), avec restaurant 2 et query conservée, cible réelle rendue, racine anonyme et aucun appel inconnu. La cuisine déclenche toujours son recalcul quotidien existant : il n’est pas supprimé par cette refonte et reste entièrement simulé dans le test. Régression compilée complète suivante en attente.


Checkpoint compilé 307 : validation complète réussie (exit 0), dont tous les scénarios de ce lot. 597 tests unitaires et 6 141 clés i18n.
