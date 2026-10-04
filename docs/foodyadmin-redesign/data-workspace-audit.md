# Données cuisine — audit avant migration

Route `/[restaurantId]/kitchen/data`, réservée à `kitchen.data_manage` (distinct de kitchen.manage). Sources proches consultées : préparations et leurs reçus de mutation, ConfirmDialog, journal d’approvisionnements, tests adjacents `tests/kitchen/data-workspace.spec.ts`.

Quatre modes indépendants : import historique avec association groupée nom/source/famille, simulation (volume, seed, jours fermés), stock de départ (défauts, unités, exceptions), reset (dates/global, journées et mouvements, import ciblé). Prévisualisation persistée puis checkbox avant apply ; backup, restore avec checkbox, archive et nouveau scénario. Ne pas modifier ces règles ou les effets métier.

Points à traiter : erreurs de chargement distinctes de loading, pas de double action, reçu de réponse conservé avant rafraîchissement du journal, garde du brouillon sur changement de mode/journal/retour, confirmations de reset et restore intactes. L’archive ne doit pas rester visuellement en draft après une réponse confirmée si le GET échoue. Champs natifs validés avant preview ; limites de fichiers déjà décrites dans i18n (62 fichiers, 10 Mo/fichier, 25 Mo total). Tables défilables au clavier, styles communs clair/sombre, mobile et RTL, champs nom en direction auto.

Limite d’audit : le checkout `foodyserver` accessible ne contient pas les endpoints `stock/data-workspace` (recherche effectuée). Contrat lu dans api.ts et tests adjacents ; aucun changement de serveur. Les validations à venir porteront sur les requêtes client synthétiques, pas l’application/restauration réelle. La simulation annonce une isolation conformément au contrat UI existant ; elle n’est pas certifiée ici côté serveur.

## Ciblage après implémentation

11 scénarios dédiés passent en développement (34,8 s), puis 3 tests adjacents existants (7,1 s). Les scénarios vérifient l’application/restauration/archive confirmées suivies d’un GET en erreur, la protection des paramètres, l’import et ses associations groupées, les limites de fichiers, les quantités zéro/défauts/unités, la permission dédiée, le refus d’appliquer l’ancien aperçu quand une nouvelle sélection échoue, et les détails de simulation. Le nouveau draft est ajouté au journal local dès sa réponse confirmée.

Finitions : quantités avant/après visibles ensemble sur mobile, boutons des quatre modes sans numérotation trompeuse, grille stable et champs de poids normal. Les trois captures ciblées qui utilisent ces finitions repassent. Formulaire FR mobile, revue HE sombre, simulation et revue avant/après mobile réellement inspectés. Régression compilée complète suivante en attente.


Checkpoint compilé 307 : validation complète réussie (exit 0), dont tous les scénarios de ce lot. 597 tests unitaires et 6 141 clés i18n.
