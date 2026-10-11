# Tournées — audit et portée

La page existante (731 lignes), les contrats DeliveryTour/Input, zones et cartes, ainsi que delivery/tours.go (CRUD, validation, visibilité, frais et handlers) ont été lus. Comparables : zones de livraison, appareils, profils d’impression et primitives Drawer/ConfirmDialog. Référence visuelle : prolongement du système produit de la landing locale ; pas de maquette directe de cette page.

Lecture et écriture des tournées et zones : orders.manage. Liste de cartes : menu.view. Ne pas transformer l’absence de droit ou un échec de cartes en liste vide. Les relations préchargées permettent toujours d’inspecter une tournée existante. Les zones proposées doivent être actives et tour_only, les cartes web_enabled=false. Aucun assouplissement backend. Le garde de route et la navigation doivent suivre orders.manage.

Dates : delivery_date est un jour calendaire sérialisé à minuit UTC ; conserver ses dix premiers caractères, sans déplacement dans un fuseau négatif. opens_at/cutoff_at sont des instants RFC3339. Le formulaire existant utilise le fuseau du navigateur pour datetime-local : conserver ce comportement en le rendant explicite. Préserver opens_at lors d’une modification/publication et la précision du cutoff inchangé. La duplication reprend les champs métier, remet les dates aux valeurs nouvelles et crée une identité/slug distincts seulement lors de l’enregistrement. Créneau HH:MM obligatoire et début < fin, cutoff > opens. Pas de nouvelle règle date/clôture inventée.

TourGuard/tourVisible refusent les tournées sans zone ou sans créneau annoncé, même si publiées. Le statut UI ne doit pas afficher « en cours » pour ces anciennes données. Les badges de publication et de calendrier restent séparés, avec actualisation de l’horloge. Contradiction documentaire backend : les anciens commentaires DeleteTour évoquent une protection de la fenêtre ouverte, mais le code actuel ne bloque que les tournées ayant des commandes ; respecter le code réel et le 409. Les zones sont protégées par les tournées vivantes liées. Aucun fichier Go modifié.

Frais/minimum null héritent de la zone, zéro reste explicite. Le minimum résolu à zéro peut ensuite retomber sur le réglage global dans le traitement de commande : ne pas annoncer « aucune limite » sans preuve. Le paiement préalable reste un booléen transmis sans toucher au moteur de paiement.

La création d’une ville puis d’une tournée comporte deux écritures non transactionnelles. L’ancien code conserve un identifiant de ville confirmé mais ne protège pas une réponse perdue ; il ne fait pas de rollback. Prévoir vérification GET et conservation de l’étape confirmée sans répétition automatique de POST. Le serveur peut créer/sauver puis échouer au GetTour final. Pas d’idempotence ni ETag : une création concurrente identique reste ambiguë et doit être revue. Aucun envoi client : le partage produit uniquement un texte à copier, avec repli manuel ; ne pas fabriquer un lien à partir d’un identifiant restaurant lorsque son slug n’est pas disponible.

Prévoir liste responsive, recherche/filtre d’état, éditeur latéral structuré, gestion des villes, confirmation de suppression/dépublication, garde du brouillon, erreurs séparées et reprises, désactivation des contrôles pendant une mutation, scopes et générations de requêtes. Les liens vers les cartes suivent leurs permissions. Tests API synthétiques uniquement.

Audit préalable terminé ; implémentation et preuves à compléter après le lot Zones de livraison.

## Report explicite

L’utilisateur a exclu Tournées du périmètre courant. L’ébauche locale de page/helper était incomplète et non validée ; elle est conservée uniquement en patch sous `deferred/delivery-tours-unvalidated.patch`. Le code actif de Tournées est revenu à sa version pré-lot, sans appliquer les propositions de cet audit.
