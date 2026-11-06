# Revue : suivi Admin des paiements fidélité

Tranche locale du 31 octobre 2026, sur la branche `feat/wallet-loyalty-admin-20261031`, issue de `origin/develop` `099aaa167f7b63ab79459a15f8606181c0630699`. Aucun programme, carte Wallet, route serveur ou environnement réel n'est activé. L'API et l'Admin conservent chacun un flag séparé, faux par défaut. Le compte rendu consolidé est dans `output/wallet-loyalty/lot3k-validation.json` du workspace.

## Intention visuelle et parcours

Le sujet est une file de travail financière, à examiner commande par commande. Le tableau et son panneau de détail réutilisent les composants Foody `PageHead`, `Table`, `Badge`, `Drawer`, `Field`, `Input`, `Button`, `ConfirmDialog` et `EmptyState`. Palette de jour existante : fond/surface #ffffff, texte/action #171717, texte secondaire #555555, lignes #e5e5e5, avertissement #865800. Le mode sombre conserve les tokens correspondants. La police existante `--font-sans` reste Arial/Heebo selon la langue. Aucun nouveau kit de cartes, graphique, police ou image n'est introduit.

Le point d'entrée « Paiements fidélité » est réservé aux permissions financières et au build opt-in. Le titre et la description précèdent une liste sobre : commande, état du paiement, réservation de récompense, montant vérifié, action Examiner. Les colonnes secondaires se replient sur mobile ; le montant reste dans la ligne de commande. Le panneau s'ouvre du côté adapté à la lecture, garde un pied d'action visible et présente le montant avec sa propre devise. L'action de clôture est visuellement distincte de l'actualisation en lecture seule. La critique visuelle a été faite sur les captures synthétiques finales, stabilisées après les transitions ; aucun contenu n'est coupé en desktop ou en hébreu mobile sombre.

## Contrat et autorité

`NEXT_PUBLIC_LOYALTY_CHECKOUT_RESOLUTION_ENABLED=true` rend la navigation et l'écran disponibles dans le build contrôlé. Le défaut masque le lien ; un accès direct présente un état indisponible sans appel fidélité. Aucun flag ne configure un programme ou une adhésion. Le serveur doit disposer séparément des routes opt-in du lot précédent et du nouveau champ de détail `can_request_close`.

Le client utilise le JWT et `X-Restaurant-ID` du module API commun. Les types et appels sont centralisés dans `src/lib/api.ts`, avec validation des états requis, identifiants, révision, montants/devise, dates et curseurs. Une réponse incomplète ne devient jamais un montant nul ou une liste vide. Les messages d'erreur sont traduits depuis une liste locale, jamais depuis un texte SQL/prestataire. Un ancien serveur sans capacité de clôture conserve une lecture seule explicite.

Le bouton ne se déduit pas du nom de rôle ou d'une permission globale en mémoire. Le détail serveur calcule l'autorité courante `can_request_close` à partir de la même politique financière que la commande. Le client la combine avec les étapes prises en charge ; une étape inconnue ou à examiner ne propose pas d'action. Le serveur reste l'autorité lors de la mutation. Une erreur de stockage lors du calcul de capacité reste une erreur et n'est pas transformée silencieusement en refus.

La liste, le panneau et les réponses asynchrones sont liés au restaurant et à l'acteur. Une nouvelle portée remonte ses composants et invalide les réponses précédentes. Un changement d'utilisateur dans un autre onglet ou au retour de focus retire immédiatement les lignes et le panneau précédents. Un contrôle de l'acteur stocké précède l'envoi. Les réservations d'une autre commande ou session ne sont jamais adoptées.

## Commande durable et reprise

L'opérateur ouvre le détail frais, saisit un motif court sur une seule ligne et confirme explicitement la clôture. Le contrôle d'entrée reprend la limite serveur en octets UTF-8. L'interface ne propose aucun statut bancaire manuel et n'affirme pas qu'une récompense expirée redevient utilisable.

Avant le POST, l'entrée complète d'origine est écrite et relue dans `sessionStorage`, sous une clé liée à restaurant/acteur/commande. Elle ne contient ni JWT, contact client, carte, secret ou réponse de prestataire. Le motif staff est conservé seulement pour cette reprise et retiré après un accusé final connu. Une absence, corruption ou impossibilité de stockage bloque l'envoi au lieu de générer silencieusement une autre demande. Un verrou synchrone empêche les doubles soumissions ; fermer le panneau ou quitter pendant l'envoi est protégé.

Une réponse 202 ou un résultat réseau/stockage incertain conserve UUID, révision et motif initiaux. La reprise est toujours explicite, après confirmation, et réutilise le même corps ; aucun POST n'est automatique. Un rechargement dans la même session peut donc continuer la demande sans seconde initiation. Une autre personne ou session sans ce corps ne peut pas fabriquer une reprise : elle peut lire le suivi et est orientée vers la session d'origine. Cette limite reste explicite avant un déploiement général ; le serveur n'expose pas le motif et la révision d'origine aux autres sessions.

Un 409 définitif suivi d'un nouveau détail sans aucune entrée de journal prouve que cette première demande n'a pas été acceptée. Le client retire alors cet ancien corps, affiche que la commande a changé et exige une nouvelle revue et confirmation. Un journal existant ou une issue inconnue ne permet jamais ce remplacement. Les accusés `closed` et `settled` sont distingués : la vente gagnante reste payée et son droit consommé. Une erreur d'effacement du stockage après un succès est signalée sans nier le résultat déjà confirmé.

## Aide et langues

Tous les libellés, indications, états, erreurs et confirmations sont traduits en FR, HE et EN dans l'i18n existante. Les tests de parité et les vues navigateur vérifient les trois langues ; l'hébreu utilise la direction RTL et le mode sombre. Les aperçus n'utilisent que des données synthétiques.

La fonctionnalité reste inédite et désactivée dans les environnements réels. Aucun écran ou article public existant n'est présenté comme une fidélité déjà disponible. La revue exacte d'impact, les inventaires et les contrats sont actualisés ; les guides publics FR/HE/EN restent inchangés. Les procédures ci-dessous servent uniquement au pilote interne, hors corpus public. Leur publication et l'activation des contrôles devront être coordonnées avec la livraison du module complet.

### Pilote interne FR

Ouvrir Paiements fidélité, puis Examiner sur une commande. Lire l'état du paiement, la réservation et le montant vérifié. Seul un responsable actuellement autorisé voit l'action de clôture. Saisir le motif et confirmer. Une attente n'autorise pas une seconde demande : actualiser l'état ou Reprendre la même demande depuis la session d'origine. Si une vérification supplémentaire est requise, conserver la commande en examen ; aucune libération forcée n'est disponible.

### Internal pilot EN

Open Loyalty payments, then Review an order. Read its payment state, reward reservation and verified amount. Only a currently authorized financial manager sees the close action. Enter a reason and confirm. A pending outcome does not authorize a replacement request: refresh the state or Resume the same request from the original session. Keep unsupported cases under review; no forced release is available.

### פיילוט פנימי HE

פתחו את תשלומי המועדון ובחרו בדיקה להזמנה. בדקו את מצב התשלום, שמירת ההטבה והסכום המאומת. רק בעל הרשאה פיננסית עדכנית יכול לראות את פעולת הסגירה. הזינו סיבה ואשרו. תוצאה בהמתנה אינה מתירה בקשה חלופית: רעננו את המצב או המשיכו את אותה בקשה מהפעלת הדפדפן המקורית. במקרים הדורשים אימות נוסף השאירו את ההזמנה לבדיקה; אין שחרור כפוי.

## Validation et limites

Les tests unitaires portent sur les contrats financiers, curseurs, résultat de la bonne demande, séparation acteur/restaurant, stockage corrompu/indisponible et motif UTF-8. Les tests navigateur utilisent des API entièrement synthétiques : consultation, demande confirmée, réponse perdue puis rechargement, attente sans répétition automatique, changement d'acteur, lecture seule, rejet périmé, stockage indisponible, états vide/indisponible, erreurs masquées et navigation vers un autre restaurant. Les vues FR/EN et mobile HE sombre sont vérifiées. Un scénario séparé valide le flag désactivé sans requête fidélité. Les résultats complets lint/TypeScript/build et leurs limites sont consignés dans le rapport.

Le parcours reste limité aux résolutions locales et Stancer déjà reconnues par l'API. Aucun programme, membre, scanner POS, carte Apple/Google ou nouveau protocole bancaire n'est livré par cet écran. Les cas inconnus et les autres sessions sans corps initial restent en lecture/examen. Aucune API de forçage, nouveau paiement ou émission de notification n'est introduite. Aucun commit, push, déploiement, changement de `.env` réel ou message client n'est effectué.
