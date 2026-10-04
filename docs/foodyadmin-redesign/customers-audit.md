# Clients — implémentation et validation ciblée

Lecture seule après le checkpoint 307, pendant les tests du Lab. Route clients : 661 lignes, MergeCustomersModal, DuplicateSuggestions et formulaire partagé CustomerDeliveryFields. Début, chargements/mutations et tableau lus ; fin du formulaire et services serveur restent à lire avant édition. Contrats API list/profile/trusted/duplicates/merge/unmerge/dismiss lus.

La liste fusionne les agrégats analytiques paginés avec les clients autorisés à payer en espèces sans commande (première page sans recherche). Garder cette règle et la normalisation 972/0 des numéros. Sélection multiple remise à zéro sur changement de page/recherche. Les fusions modifient des liens d’identité, pas les commandes historiques.

Risques :
- Échec de chargement transformé silencieusement en liste vide ; aucune garde de réponse par restaurant/recherche/page. Remonter par restaurant et invalider les réponses périmées, erreurs/reprise distinctes.
- Chargement du profil sans garde si une autre fiche s’ouvre ; erreur ignorée puis formulaire de nom/autorisation modifiable avec adresse vide. Distinguer champs effectivement chargés et état indisponible avant sauvegarde.
- Sauvegarde profil puis autorisation espèces, parfois retrait/recréation pour changer les notes. Garder les étapes confirmées (notamment l’identifiant supprimé/nouveau) et permettre reprise sans répéter les effets ; ne pas masquer les échecs de rechargement.
- Ajout et édition n’ont pas de garde de brouillon ni de verrou immédiat ; modale fermable en cours d’écriture. Détachement de téléphone à vérifier dans la seconde moitié du fichier.
- Suggestions : erreurs de GET transformées en disparition ; plusieurs paires à ignorer mais pas de reçu des paires déjà traitées. Actions de groupes concurrents mal représentées par un seul busyKey.
- Fusion : choix du numéro principal existant conservé, champs à bloquer pendant envoi, erreurs accessibles, reprise après succès/rechargement, contrôle des lignes réellement sélectionnées.
- Tableau : cellules cliquables sans bouton clavier, noms/téléphones tronqués, alignement physique left et numéros RTL. Préserver l’accès lecture seule.
- CustomerDeliveryFields partagé avec les nouvelles commandes : toute modification exige régression de ce consommateur et maintien du contrat commun.

Aucune donnée client réelle ne sera utilisée. Les cas de fusion, coordonnées, autorisation espèces, adresse et profil seront synthétiques ; aucun message WhatsApp ni appel téléphonique réel.


## Contrat serveur examiné

cmd/server/main.go 2006–2044 : restaurant scoping explicite et permissions CustomersView/CustomersManage. Handler et service consultés. AddTrusted crée ou restaure le même enregistrement supprimé ; refuse un doublon encore actif. RemoveTrusted refuse un identifiant déjà supprimé : il faut retenir cette phase lors d’une reprise. Le nom ET l’adresse des clients sans compte sont désormais des overrides d’identité du restaurant, contrairement aux commentaires anciens du client/API. Les champs d’adresse doivent donc rester éditables pour les invités. UpdateProfile écrit nom, adresse puis compte éventuel en plusieurs étapes internes : une réponse d’erreur n’assure pas qu’aucun champ n’a changé, le client ne doit pas annoncer d’atomicité.

Fin de la page et DuplicateSuggestions lus. Détachement actuel ferme la fiche et perd ses changements en cours ; prévoir confirmation locale/gel et conservation des brouillons. Deux implémentations similaires consultées via les éditeurs existants et le hook useKitchenMutation ; troisième modèle pertinent : éditeur d’article par phases. Ne pas réutiliser aveuglément les règles cuisine pour les identités clients.


Contrats fins : resolveAccount cherche une commande du restaurant pour autoriser l’accès au compte ; les overrides d’adresse/nom restent par restaurant/identité. La réponse GetProfile contient last_delivery mais pas d’indicateur distinguant une adresse explicitement vidée d’une adresse jamais renseignée. Le remplissage existant champ-par-champ avec p.field || last_delivery.field peut donc réafficher une ancienne adresse après effacement ; ne pas inventer une distinction serveur absente. Les fichiers de tests d’overrides ont été repérés, à lire si ce flux est modifié.


## Implémentation après le checkpoint 331

Page isolée par restaurant, réponses de liste invalidées par requête, erreur distincte du vide, reprise explicite. Recherche/pagination/tri et normalisation des téléphones conservés. Fiches ouvertes par boutons clavier, numéros en bdi LTR, noms complets, dates selon la langue. Autorisations customers.manage conservées.

Formulaire partagé CustomerForms : profil entièrement chargé avant édition, réponse tardive annulée au démontage, adresse client invité conservée, brouillon et beforeunload. Étapes confirmées profil/retrait espèces/ajout espèces/rechargement retenues. Ajout/fusion/détachement ne répètent pas une écriture confirmée si seul le rafraîchissement échoue. Double clic verrouillé immédiatement, fermeture bloquée en vol. Détachement confirmé sans effacer la fiche en cours. Suggestions avec erreur/reprise, liste indépendante des filtres, reçu pour chaque paire ignorée ; toutes les paires du groupe sont traitées.

Le composant CustomerDeliveryFields reste unique pour quatre écrans ; seul dir=auto a été ajouté aux saisies. Le test adjacent de non-duplication passe via npm test. L’autorisation espèces reste liée au record primary que joignait déjà cette page. Limite métier préexistante : IsTrusted serveur prend en compte n’importe quel numéro fusionné alors que cette vue associe le record primary ; les autorisations sur alias peuvent donc être représentées imparfaitement. Ce lot ne change pas les règles ni le serveur paiement. Les réponses de mutation perdues avant accusé de réception ne sont pas garanties idempotentes ; les reçus locaux couvrent les succès effectivement confirmés. Le formulaire protège fermeture locale et beforeunload, pas une navigation SPA globale.

20 scénarios clients et quatre régressions rapports passent (24/24 en 1,1 minute). Premier ciblage 17/17, puis extension à 20. Captures FR mobile et HE sombre réellement inspectées ; cadrage de la capture mobile remis en haut après le tour de tabulation. 597 tests unitaires configurés passent ; i18n 6 166 clés FR/EN/HE. Une erreur de typage dans les options de fixture et une dépendance lint ont été corrigées après cette série ; lint/types/build et régression compilée suivent. Aucune donnée réelle, aucun contact ni changement de serveur.

## Clients — checkpoint compilé 351

351 scénarios passent, 0 échec/skip/flaky ; début 2026-10-04T08:55:29.910Z, durée 889334.556 ms. Lint/types/build exit 0, 23 avertissements ; 597 tests configurés passent, six Lab explicites du checkpoint précédent inchangés. 6 166 clés i18n. Captures compilées fiche FR mobile, liste HE sombre et fusion FR inspectées. 54/102 routes documentées, 48 encore inventoriées. Équipe et Langue sont le prochain lot. Aucune API métier réelle ni déploiement.
