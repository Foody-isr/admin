# Limites et incohérences repérées

## Paramètres généraux préexistants

Le formulaire initial présentait `legal_name`, `email`, `tax_id`, `capacity` et `number_format` comme éditables, mais ne les chargeait ni ne les transmettait dans `updateRestaurant`. Le contrat TypeScript `Restaurant` n'expose pas ces champs. « Exporter toutes les données » et « Fermer le compte » n'avaient aucun gestionnaire d'action ; l'annonce d'une suppression après 30 jours n'était pas reliée à une opération.

La refonte les regroupe explicitement comme indisponibles ; elle ne crée aucun contrat API et n'invente aucune sauvegarde. Les champs effectivement persistés restent identiques. La fermeture/export globaux doivent faire l'objet d'un travail fonctionnel séparé. Les offsets GMT fixes (incorrects selon la saison) ont été retirés des libellés de fuseau, sans changer les valeurs IANA.

Les montants conservent la convention symbol-first du formateur existant. Aucun changement silencieux de devise, de conversion monétaire ou de journée de service.

## Vérification partielle

Les fixtures vérifient l'interface et les requêtes du client, pas la persistance du serveur, les paiements, les imprimantes, WhatsApp ni Siri. Les captures utilisent uniquement des données fictives.

Les formulaires communs Radix ont une fermeture/focus cohérente ; AiDrawer et SearchableSelect utilisent désormais Radix ; leur parcours complet nécessite encore une revue clavier sur leurs consommateurs. Certains autres popovers hérités restent à migrer. Les autres pages listées sans statut de migration dans l'inventaire ne sont pas validées par la simple propagation des tokens.

L'avertissement de sortie des paramètres couvre les liens internes cliqués et le déchargement de page. La navigation arrière interne du navigateur reste à examiner. Les accès secondaires ont désormais des fixtures de réinitialisation et d’activation propriétaire/salarié ; les mécanismes serveur réels (expiration, e-mail, biométrie) restent hors de cette vérification. Les erreurs des éditeurs de jeux d’options/modificateurs restent à compléter.

La comparaison food cost conserve sa restriction aux écrans larges ; la vue principale est désormais utilisable sur mobile. Les gardes DesktopOnly d’autres modules non migrés sont conservés. Les rapports clients/articles ont désormais leurs propres scénarios de détails, recherche, erreur et clavier. Leur pagination et les croisements avancés restent à approfondir. Les cinq routes Personnel/Rôles migrées ont des fixtures de mutation et de lecture seule ; cela ne valide pas les autorisations du serveur ni l’envoi réel d’invitations.

## Bibliothèques catalogue et accès

L’image de catégorie conserve la persistance immédiate du flux existant. Le formulaire l’annonce et actualise la liste après succès ; annuler le nom ne prétend pas annuler l’image déjà enregistrée. Les modèles d’images sont édités comme des instructions, sans exécuter leur génération. Le lien de téléchargement POS est fourni par le serveur ; un lien absent est désormais signalé, sans fabriquer d’URL.

## Contenu des cartes

Dans le détail, « Dupliquer l’article », « Modifier les modificateurs » et « Archiver » ne déclenchaient qu’une alerte « bientôt disponible ». Ils restent affichés mais désactivés et explicitement indiqués comme à venir. Aucune opération correspondante n’a été inventée. L’ajout/retrait, le déplacement, le remplacement, le classement et les disponibilités restent fonctionnels. Les déplacements restent structurels entre groupes ; les retraits/remplacements d’une série future conservent leur borne de retrait. Les écritures de groupe ne sont pas atomiques côté API : les dialogues signalent l’échec partiel et réessaient uniquement les étapes non confirmées dans la session ouverte.

## Présentation POS et éditeur de groupe

Le rendu des tuiles POS conserve les couleurs enregistrées et le texte blanc du composant existant. Le contraste des textes dans toutes les couleurs configurables n’est pas certifié. Le POS Flutter possède déjà une palette de remplacement pour la couleur par défaut ; l’aperçu admin existant ne reproduit pas cette particularité, qui n’a pas été modifiée silencieusement. Les réglages de l’administration restent lisibles via les tokens et les noms complets dans l’inspecteur.

Le filtre `category.id !== group.id` et le lien de création transmettant le groupe comme catégorie ont été corrigés dans l’interface conformément au domaine explicite dans AGENTS.md : catégories et groupes sont indépendants. Les tests couvrent la collision d’identifiants et le lien sans fausse catégorie. Le rafraîchissement des affectations conserve désormais le formulaire et la semaine sélectionnée.

Le serveur ne retire pas un parent avec un `parent_id` absent/null ; l’option de retrait est désactivée et expliquée pour les groupes ayant déjà un parent. La modification d’un parent existant reste disponible. Images et affectations restent immédiatement persistées, distinctes du formulaire. Les ajouts hors semaine courante gardent les bornes des jours travaillés ; le retrait daté garde sa borne à la veille du début de semaine, sans changement de calcul. Le texte de portée a été clarifié pour ne plus promettre à tort un retrait limité à une seule semaine.

## Prix de référence et semaines — comportements préexistants conservés

Les éditeurs d’article calculent encore le prix de référence à partir de la première variante nommée hors « combo seul », sans filtrer son état actif. Cela diffère de l’invariant général « première variante active ». La refonte n’a pas modifié ce calcul tarifaire ; une correction métier séparée doit harmoniser les consommateurs.

L’éditeur de groupe détermine encore les membres visibles au premier jour de la semaine, alors que les ajouts hors semaine courante utilisent les bornes des jours travaillés. Si le premier jour travaillé est postérieur au début de semaine, un ajout peut ne pas apparaître dans cette vue. Les bornes de persistance et la règle de sélection préexistantes sont conservées ; cette divergence nécessite une revue métier distincte. Les scénarios actuels de groupes utilisent des jours travaillés comprenant le début de semaine.

## Brouillon et création d’article

La reprise des étapes de création interrompues est conservée dans la session ouverte. Après un premier POST réussi, le brouillon de création local est retiré pour éviter une nouvelle création au retour ; fermer laisse l’article déjà créé dans la bibliothèque. Les images choisies ne sont pas conservées dans le brouillon local. Les champs au poids, indications IA, informations clients et préférences de notes sont désormais inclus dans le brouillon compatible avec la version 1. Un échec de stockage local est signalé sans bloquer la sauvegarde API.


### Contrats de l’éditeur de recette vérifiés dans ce lot

- `foodyserver/internal/stock/service.go`, `SetMenuItemIngredients` supprime puis recrée les lignes à chaque PUT. Le tableau utilise désormais une clé locale fondée sur la source (stock/préparation), l’option historique et l’occurrence de cette source. Les identifiants API restent intacts ; seules les clés d’interface sont stables. Les écritures successives repartent de la dernière liste confirmée. Une erreur conserve la ligne et propose une reprise. Le scénario de multiplicateurs couvre deux écritures successives avec tous les identifiants recréés.
- Les endpoints ingrédients, création stock/préparation et instructions/métadonnées exigent `kitchen.manage` côté serveur. Les contrôles de recette exigent aussi cette permission, en plus du droit `menu.edit` déjà utilisé par cet éditeur. Aucun changement d’autorisation serveur.
- Ingrédients, images et modificateurs sont immédiats ; instructions, notes et stock/disponibilité sont enregistrés via le bouton principal. Cela reste un ensemble de requêtes distinctes : une erreur tardive peut suivre une écriture déjà confirmée. Les nouvelles reprises de création stock/préparation évitent de recréer la fiche après sa confirmation, pendant la session du dialogue.
- Pour un article existant converti en combo, les données de recette/variantes/modificateurs sont masquées, sans suppression serveur. Le texte de confirmation l’explique ; une recette masquée n’est pas enregistrée par le bouton du combo. Les calculs métier préexistants de variantes, quantités, coût et disponibilité ne sont pas redéfinis.
- Ce checkpoint historique ne couvrait pas encore image IA, import, composition et coût. Les lots dédiés suivants étendent leur vérification, avec leur propre portée.


### Contrats de l’image IA et de l’import

- L’IA d’image conserve les endpoints `generate`, `edit` multipart et `confirm`. L’aperçu précédent reste sélectionnable après un échec de régénération, avec une légende indiquant qu’il correspond à la dernière génération réussie. La limite 8 Mo et les types PNG/JPEG/WEBP reprennent les validations serveur. Aucun appel réel à un générateur d’images pendant les tests.
- L’import de recette conserve les endpoints texte, fichier, confirmation article et confirmation préparation. Les types JPEG/PNG/WEBP/GIF/PDF et la limite 10 Mo sont ceux du handler serveur. Un échec du chargement des paramètres TVA bloque la confirmation et propose une reprise, au lieu de présenter silencieusement 18 % comme une donnée chargée. Le défaut métier `vat_rate ?? 18` reste conservé après un chargement réussi.
- `ConfirmRecipes` remplace tous les ingrédients de l’article, y compris leurs quantités par variante ; le dialogue l’annonce. Le rendement extrait d’un article est informatif, car le payload article ne comporte ni rendement ni instructions. `ConfirmPrepRecipe` remplace aussi instructions, rendement et durée d’une préparation existante. Les deux transactions créent les fiches stock manquantes ; leurs payloads sont vérifiés sans mutation du serveur réel.
- Une confirmation suivie d’une erreur de rechargement n’est pas envoyée une seconde fois tant que le dialogue reste ouvert. Une réponse serveur perdue reste une issue ambiguë : l’API ne propose pas de clé d’idempotence. Aucun changement de contrat serveur ajouté par cette refonte.
- Le formulaire partagé `StockQuantityForm` a reçu le traitement stock : champs nommés, menus clavier, unités héritées conservées, TVA et calculs inchangés. Ses consommateurs sont inclus dans la régression. Les imports de préparation sont testés, mais la page préparations et ses autres dialogues ne sont pas encore considérés comme migrés.
- Les états avancés de disponibilité (poids/par variante) restent à compléter.

### Composition et coût

- Le compositeur conserve prix de base, deltas, ordre du défaut, inclusion hors carte, règles et résolution serveur. La création implicite upsert désormais l’étape et son premier article dans une seule mise à jour. L’ajout groupé prend les résultats visibles du filtre. Les contrôles en lecture seule sont verrouillés. La suppression d’étape reste une mutation du brouillon et ne supprime jamais l’article source.
- Le cache d’aperçu et la sélection de carte sont cloisonnés par établissement. Un aperçu serveur en erreur reste explicitement inconnu et réessayable, sans faux compteur zéro.
- Les indicateurs du catalogue comptaient déjà `is_active`, pas la disponibilité calculée ni les ruptures : les libellés Actifs/Inactifs et les aides reflètent maintenant ce calcul, qui reste inchangé. Les aides de coût d’un article décrivent sa portion, pas une moyenne/totale de catalogue. Les anciennes définitions statiques non référencées ont été retirées.
- `WhatIfSimulator` garde les formules de ratios et TVA existantes, y compris les taux propres au stock. Son curseur affiche des centimes pour éviter que le contrôle natif annonce un montant arrondi au pas de 0,50 différent du montant affiché. Cela ne change pas les conversions de stockage ni les formules de marge.
- L’application du simulateur n’est pas une transaction serveur : une étape peut être confirmée avant l’échec de la suivante. Le dialogue garde une progression locale et reprend seulement les écritures non confirmées, puis le rafraîchissement. Prix et stock ont les permissions respectives `menu.edit` et `kitchen.manage`. La TVA et la portion sont verrouillées pendant cette reprise. Les coûts enregistrés sont partagés par toutes les recettes utilisant le stock ; le texte l’annonce. La session conserve les autres champs de l’article.
- Limites métier préexistantes désormais explicites : les prix de variantes historiques `var:` n’avaient aucune écriture dans ce simulateur ; les ratios à coût initial nul ne projetaient pas les overrides. La refonte n’invente ni endpoint ni formule : elle explique la limite et désactive l’application correspondante. Ces cas demandent une correction métier séparée.
- Une réponse d’écriture perdue demeure ambiguë, sans clé d’idempotence serveur. Fermer après une erreur partielle laisse les changements déjà confirmés en place. Le retour arrière SPA natif et les liens extérieurs au contenu ne sont pas entièrement couverts par les gardes de brouillon.


### Unités et règles de stock

- Le chargement de la bibliothèque et celui de ses usages sont distingués. Un échec des usages ne devient pas « Non utilisée » et bloque la suppression jusqu’au rechargement. Les conversions gardent leur quantité de base ; aucun calcul ni endpoint modifié. Le renommage conserve les identifiants de conversion, mais le client `customUnitFactor` retrouve une unité de recette par son nom : le formulaire avertit de vérifier les recettes après renommage. Aucune migration implicite des données.
- Le serveur `availability/service.go` refuse la suppression d’une règle encore affectée à un article/une catégorie ou utilisée par défaut. Le texte de confirmation a été corrigé : il ne promet plus un retour automatique au défaut. Le changement de défaut confirme le nouvel état via la réponse API ; décocher le défaut courant est désactivé, car le serveur ignore cette opération.
- `auto_disable_soldout` reste enregistré par les paramètres, mais le code serveur de stock a retiré son chemin de désactivation au profit du calcul vivant de disponibilité. Le réglage est conservé dans une section historique explicite ; les règles actuelles sont accessibles directement. Aucun changement d’API ou de moteur serveur.
- Les gardes protègent la fermeture des dialogues, les liens internes du formulaire de stock et le rechargement navigateur. Le retour historique SPA et les changements forcés d’établissement restent à approfondir pour les formulaires secondaires.


### Stock opérationnel et CSV

- La liste, l’éditeur, les mouvements, l’historique et les actions groupées conservent les endpoints et permissions `kitchen.view` / `kitchen.manage`. Le chargement initial attend aussi les paramètres TVA ; son échec ne devient pas un stock vide ou un taux présumé chargé.
- Les reprises gardent les réponses confirmées pendant la session : les suppressions groupées réessaient uniquement les articles restants ; un mouvement, une fiche stock ou un import CSV confirmé n’est pas renvoyé pour réessayer le rafraîchissement. Cela ne résout pas une réponse réseau perdue : les endpoints n’ont pas de clé d’idempotence.
- Dans l’éditeur stock, photos et illustrations sont maintenant appliquées par la sauvegarde principale. L’image est annoncée comme en attente jusque-là. La création de fiche, l’envoi de fichier et l’affectation de son URL gardent des reçus distincts. Fermer après une erreur d’image ne supprime pas la fiche déjà créée. Types JPEG/PNG/GIF/WebP et plafond 5 Mo repris du handler d’upload ; aucun fichier réel envoyé pendant les tests.
- Toutes les conversions chargées restent dans le payload, y compris celles absentes des métadonnées de bibliothèque. Un chargement d’unités en erreur bloque la sauvegarde. Les montants de conversion gardent leur unité de base et ne sont pas recalculés par la refonte.
- Le menu Ajustement conserve l’opération historique de diminution ; Réception sert à augmenter le stock. Le serveur limite le solde à zéro, mais conserve la quantité du mouvement : les deux valeurs sont expliquées et vérifiées. Le regroupement préexistant « OK » inclut les articles inactifs sans alerte ; les lignes affichent désormais explicitement Inactif. Aucun changement du classement métier.
- Supprimer une catégorie de stock retire ses réglages visuels, pas les libellés portés par les articles. Ce comportement serveur est annoncé ; la catégorie peut rester listée avec un identifiant nul tant qu’un article la porte. Le renommage conserve la mise à jour des libellés associés.
- L’import CSV présente un bilan persistant, avec les lignes ignorées et les échecs d’image du catalogue. Le bouton Terminé conserve la navigation vers la carte créée. La limite locale de 5 Mo protège la lecture du CSV ; le parseur et les payloads métier sont conservés.

### Livraison, voix et approvisionnements

- Les formules de `lineToStockInput` / `stockInputToLinePatch`, correspondances et catégories IA conservent le comportement métier. Le choix manuel d’une autre fiche ne reconstruit pas le formulaire de conditionnement ni la TVA correspondante : comportement historique à revoir séparément, pas corrigé par cette refonte. Les quantités/prix reçus restent éditables avant confirmation.
- Le serveur peut réussir `CreateDraft` sans URL après un échec d’upload. L’interface affiche le justificatif manquant et demande un choix explicite avant de continuer sans document. `UpdateDraft` conserve l’URL existante ; le client utilise désormais cet endpoint pour reprendre un brouillon. Aucun changement serveur.
- La session ouverte conserve les étapes confirmées : création de brouillon, import de stock, retrait du brouillon, rechargement. Une réponse réseau perdue reste ambiguë sans idempotence serveur. Fermer après un retrait de brouillon en erreur peut laisser un brouillon déjà importé côté serveur ; l’interface indique que le stock a déjà été importé. L’état de confirmation n’est pas durable entre sessions : ne pas réimporter ce brouillon.
- Les erreurs et arrêts du scan conservent les lignes déjà reçues ; recommencer demande confirmation avant remplacement. Les permissions, dates et appels restent ceux des endpoints existants. Le contrôle microphone utilise des doubles navigateur, jamais un vrai enregistrement ni une transcription externe. L’écoute de la note est un aperçu local ; la validité de l’audio réel dépend du navigateur et n’est pas prouvée par le double de test.
- Les montants des réceptions sont calculés par le serveur à partir des **coûts actuels** des fiches stock et peuvent différer du justificatif d’origine. L’UI l’annonce. Le total des quantités conserve l’addition historique, toutes unités confondues, avec sa limite explicitée. La liste charge les 100 dernières réceptions (limite serveur existante) ; aucune pagination inventée.
- Le détail charge ses propres lignes et ignore les réponses tardives après fermeture. La suppression de brouillon ne promet pas d’annuler des mouvements. L’aperçu image dispose d’un état d’échec/reprise ; les PDF conservent le visualiseur du navigateur et un lien vers l’original. Les PDF réels et les contrôles de téléchargement externes ne sont pas vérifiés.
- Limite de calcul stock préexistante relevée à l’audit : `serverToStockInput` arrondit et impose au moins un contenant pour certains conditionnements. La sauvegarde d’un stock nul/fractionnaire conditionné peut alors modifier sa quantité. Les fonctions métier sont conservées ; ce cas nécessite une correction distincte.

- Fournisseurs : le client retient les écritures confirmées pendant la reprise du dialogue. Aucune idempotence durable serveur après réponse perdue. Le service e-mail envoie avant d’écrire le statut ; une erreur ultérieure peut rendre le résultat ambigu. WhatsApp est marqué envoyé uniquement sur confirmation explicite. Les créneaux conservent le calcul local existant ; aucun détail/édition des bons reçus inventé.

- Préparations : `UpdateItem` serveur ignore la quantité zéro ; l’éditeur explique cette limite et bloque une fausse remise à zéro. L’ajustement garde son delta négatif existant et le résultat serveur borné à zéro. La conservation est estimée depuis `updated_at`, sans lot réel. Les reçus client empêchent de répéter les succès connus, sans résoudre une réponse de mutation perdue.
