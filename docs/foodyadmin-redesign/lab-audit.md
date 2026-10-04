# Recipe Lab — checkpoint compilé 331

Page + 18 composants, environ 2 700 lignes. Sources lues : page, useDraftQueue, useRefineDraft, types, ManualRecipeStarter, DraftQueue, LabEntryChoice, RecipeTree, FoodCostTargetSetting, RefineDrawer, VersionHistory, normalize/API et routes serveur. Reste à lire tous les autres composants et les handlers/services en détail avant modification.

## Surfaces et risques constatés

Entrée manuelle/IA, brief et sélection articles, file de drafts avec polling/WebSocket, fiche recette ingrédient/préparation/instructions, ajout depuis bibliothèque, import texte manuel, résumé et conseils, réglage cible, affinage conversationnel, génération/confirmation d’image, historique/restauration, commit/remplacement et suppression.

- Autosave debouncé : l’ancien timer n’est pas invalidé en changeant de draft ; une réponse peut remplacer le payload d’un autre draft. Des PATCH concurrents peuvent arriver en ordre inverse. Sérialiser/coalescer, isoler par restaurant/draft, attendre la sauvegarde avant commit/actions immédiates, garder le brouillon et retry après erreur.
- Queue utilisée deux fois via le hook : refetch de la page ne met pas directement à jour celle affichée. Erreur du hook ignorée par DraftQueue ; pas de garde des réponses par restaurant. Mutualiser l’état du parent, exposer erreur/reprise.
- Commit utilise confirm/alert natifs, delete sans confirmation et erreurs avalées. Éviter de répéter le commit confirmé lors d’une erreur de rafraîchissement, geler les contrôles et rendre les erreurs visibles.
- FoodCostTargetSetting affiche 35 % en cas d’erreur et garde un changement optimiste échoué ; charger explicitement, conserver valeur serveur, erreur/reprise, option historique hors 25/30/35/40. Aucune modification du seuil/calcul backend.
- RefineDrawer artisanal : clavier/focus, champ nommé, isolation de conversation et réponse périmée, conservation du message en erreur. Le serveur conserve déjà l’historique : vérifier son contrat avant de changer la sémantique.
- VersionHistory avale les erreurs de chargement, confirmation native et rejet non géré ; restauration est une écriture réelle de recette, ne pas présenter comme simple brouillon.
- RecipeTree : préserver conversions/préparations, rendre champs et suppressions identifiables, direction automatique des instructions, sélection et détails accessibles. Tokens/rayons sobres correspondant au produit Landing.

## Serveur accessible en lecture seule

main.go 1889–1922 : groupe lab avec EnforceRestaurantAccess + rôles owner/manager, endpoints génération/manual/import-text/list/get/patch/simulate/refine/images/commit/discard/versions/restore ; cible food-cost dans groupe settings identique. L’UI expose kitchen.manage selon son comportement existant ; ne pas inventer un changement d’autorisation serveur. Toute IA, image, commit ou restauration sera simulée dans le navigateur.

Le lot suivant doit lire particulièrement handler.go, service.go, commit.go, chat.go, image.go, version.go et manual_import.go avant les changements de coordination.


## Implémentation en cours — 4 octobre, après checkpoint 307

Sources supplémentaires lues : tous les composants, hooks, normalisation, API, handlers Generate/CreateManual/Patch/Import/Commit/Target, intelligence.Recalculate, commit.go, chat.go, image.go et version.go. Recalculate incrémente la révision ; PATCH ne s’applique qu’aux drafts ready. Commit conserve un résultat et un statut committed. RestoreVersion écrit immédiatement ingrédients/instructions et ajoute une version, sans recréer de stock/préparation. L’import texte est déterministe et ne persiste pas la recette.

- Éditeur remonté par restaurant/draft ; autosauvegarde sérialisée et coalescée, révision canonique reprise, abandon des timers au démontage, erreurs et retry. Les actions d’affinage, d’image, de restauration et de commit attendent la dernière version enregistrée.
- Commit confirmé puis erreur de transport : reprise par GET du statut avant tout PATCH ou nouvel enregistrement. Ce contrôle repose sur le contrat existant committed, sans garantie nouvelle de concurrence inter-onglets.
- File commune avec erreurs/reprise, réponses périmées invalidées, ajout immédiat des propositions acceptées et retrait des drafts terminés. Polling et événements Lab conservés.
- Suppression et remplacement confirmés par dialogue accessible. Brouillon local, notes de recette et conversation non envoyée protégés sur retour local ; beforeunload. Navigation globale SPA reste à compléter.
- Restauration explicite de la vraie fiche ; reçu local entre restauration, mise à jour du draft et rechargement de l’historique. Un échec de la deuxième phase ne rejoue pas la restauration confirmée. Réponse perdue de restauration non couverte par une idempotence serveur.
- Modales partagées pour les catalogues ; onglets RTL clavier, recherche nommée, monnaie restaurant, erreurs visibles. Conversions et valeurs par défaut 100 g / 100 ml / 1 unité inchangées, unités historiques conservées.
- Affinage : historique serveur visible, texte conservé après erreur, pas de faux message d’assistant pour l’erreur technique ; Entrée respecte la composition IME.
- Images : trois demandes conservées, succès partiels visibles, confirmation accessible sur mobile, révision vérifiée avant confirmation, URL confirmée reprise dans les prochaines sauvegardes.
- Import texte : aperçu invalidé quand le texte ou la dictée change, réponse périmée ignorée, fin de dictée sur fermeture/démontage ; instructions existantes conservées si l’extraction n’en retourne pas.
- Cible food cost : état indisponible explicite, valeur serveur conservée sur échec, valeurs historiques hors presets visibles ; contrat fraction 0–1 documenté sans changer les règles.

Six tests unitaires ciblés passent (normalisation et patches, dont trois nouveaux tests de patches invalides/quantité zéro). Première série navigateur : 11 succès/4 échecs, liés aux sélecteurs de test et aux erreurs ponctuelles consommées par Strict Mode ; assertions conservées et scénarios rendus déterministes. Deuxième série étendue en cours. Ne pas compter cette route dans l’inventaire tant que son lot n’est pas validé.

Visuel : inspection FR mobile de la fiche et du sélecteur ; onglet tronqué corrigé en deux colonnes, résumé passé au fond bleu produit. Captures de finition et HE à inspecter. Calculs serveur, dictée réelle, IA réelle et stockage d’images externes restent non vérifiés ; toutes les mutations navigateur utilisent les fixtures isolées.


La validation serveur refuse aussi les composants de quantité <= 0 (validate.go), y compris avant le cas Recalculate du manuel vide. La sauvegarde locale expose désormais un message de quantité strictement positive, conserve la saisie et autorise la suppression du draft invalide. Les fixtures PATCH ont été alignées. Le test métier existant qui vérifiait à tort un enregistrement de zéro a été corrigé pour une valeur positive ; un scénario séparé couvre le refus de zéro. Reprise après validation locale couverte pour éviter qu’une promesse déjà rejetée bloque les sauvegardes suivantes.

23 scénarios navigateur dédiés ont passé, puis cinq scénarios ciblés passent après la dernière correction (dont le 24e, reprise après validation locale). Lint/types réussis, 23 avertissements préexistants ; 597 tests de la commande npm test ; six tests Lab explicitement ciblés réussis. La commande npm test actuelle ne découvre pas les fichiers sous les segments de route entre crochets ; les six tests Lab sont donc exécutés séparément avec un glob adapté. Aucun changement du script général dans ce lot. 6 160 clés i18n synchronisées. Build compilé puis régression complète en cours.


La capture du studio a mis en évidence que les classes historiques @container/@md n’étaient pas générées (plugin absent). Un module CSS local explicite règle maintenant la largeur du studio et de l’import texte, sans dépendance ni modification globale. Les champs du studio ont des libellés visibles ; trois miniatures accessibles tiennent sur la ligne. Deux tests images/import passent après correction, capture du studio réellement inspectée. Les miniatures rouges et le symbole C2 sont des données de fixture, pas des images IA réellement générées.

## Validation finale du lot

331/331 scénarios compilés passent, dont 24 Lab ; aucun échec/skip/flaky. Lint/types/build exit 0, 23 avertissements. 597 tests configurés et six Lab explicites passent ; 6 160 clés synchronisées. Captures compilées fiche FR mobile, fiche HE sombre, studio FR réellement inspectées. Cette route est désormais comptée comme migration partielle documentée (53/102 au total). Les limites ci-dessus restent ouvertes. Les sections antérieures retracent les corrections intermédiaires.
