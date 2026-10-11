# Système d'interface Foody

## Direction et composition

La navigation gris clair porte le wordmark C2 (symbole seul lorsqu'elle est réduite). La barre supérieure identifie l'établissement et donne accès à la recherche réelle. Le contenu reste blanc, avec des séparateurs et des surfaces de résumé bleu pâle. Les panneaux de données ont un rayon de 8 px, les contrôles 6 px. Aucun décor ou cadre de tablette de la landing n'est importé.

```text
Wordmark      Établissement                         Recherche / compte
Navigation    Titre et contexte                            Actions
              Période / filtres
              Résumé d'activité       Actions opérationnelles
              Données / graphique     Détails utiles
```

Listes : largeur disponible et défilement contenu. Formulaires : largeur maximale 980 px ; éditeurs complexes : contenu et résumé secondaire. Mobile : navigation en dialogue, actions de 44 px, filtres flexibles et lignes opérationnelles adaptées. RTL : ordre logique et alignements start/end, chiffres isolés, logo non retourné.

## Tokens

Sources exécutables : `src/styles/tokens.css`, `fonts.css`, `tailwind.config.ts`.

| Rôle | Clair | Sombre (dérivé) |
|---|---|---|
| Page / surface | #ffffff | #14191e / #1b2228 |
| Surface secondaire | #f5f6f7 | #242d35 |
| Texte | #171717 | #f4f6f8 |
| Texte secondaire / métadonnées | #525b63 / #68727b | #c0c9d0 / #9eacb7 |
| Navigation | #f8f9fa | #171e24 |
| Séparateur / contrôle | #e1e5e8 / #7d8992 | #35414b / #6b7c89 |
| Résumé | #edf4f8 / #153b5b | #203848 / #cee4f7 |
| Marque (logos, accent) | #eb5204 | #eb5204 |
| Action / texte | #b83d00 / #ffffff | #ff9866 / #171717 |

L'orange #eb5204 est conservé dans l'identité ; un orange plus sombre est utilisé pour les petits textes blancs des contrôles afin d'atteindre le contraste AA. Le focus a un contour contrasté avec un espace de 2 px, distinct de la sélection. Les couleurs sémantiques associent texte et fond dans les deux thèmes ; elles ne modifient pas le sens métier des statuts.

Typographie : Manrope / Heebo, 400 pour le texte, 600 pour titres et contrôles, 800 réservé aux rares accents. Titre de page 28/34, section 18/24, panneau 16/24, texte 14/22, navigation 14/22, aide 13/20, métadonnée 12/18. Chiffres tabulaires dans la même famille, monnaie isolée. Polices locales de FoodyLanding et licences OFL conservées dans `public/fonts` ; aucune requête Google Fonts au build.

Espacement : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px. Navigation 244 px / 72 px réduite ; barre supérieure 64 px. Contrôles 40 px, actions principales/tactiles 44 px. Pas de hauteur fixe pour un texte qui peut s'étendre.

Mouvement : 120 ms contrôle, 180 ms panneau, 240 ms maximum ; courbe cubic-bezier(.2,.8,.2,1). Respect de `prefers-reduced-motion`. Ombres réservées aux overlays et très légères aux surfaces élevées.

## Revue du plan

Le grand titre serif, les dégradés orange et les cartes très arrondies de l'ancien handoff ne figurent pas dans les références produit finalisées : ils sont remplacés par Manrope/Heebo, la composition de ticket, les surfaces sobres et les résumés bleus observés. Le dashboard et les paramètres prolongent ces références sans inventer une maquette marketing. Les dimensions miniatures des démonstrations ne sont pas reprises telles quelles.

## Adaptations vérifiées

Création de commande : catalogue et ticket côte à côte sur desktop, deux vues explicites sur mobile ; prix et quantités restent calculés par les fonctions métier existantes. Le drawer d'encaissement place l'action principale en bas sur mobile.

Coût recette : jauge, prix de vente et ventilation du coût inspirés de la démo Food cost. La cible admin de 35 % est conservée (la démo marketing illustre 30 %). Le seuil n'est pas une décision graphique. La marge affichée exclut toujours les autres charges.

Les dialogues contrôlés mémorisent l'élément déclencheur pour rendre le focus à la fermeture. Les éditeurs de traduction replient les langues sur plusieurs lignes lorsque nécessaire. Les changements de langue du navigateur sont séparés des sauvegardes restaurant.

## Rapports et personnel

Les petits graphiques de détail proposent les valeurs complètes dans un tableau ouvrable au clavier. Les panneaux de rapport utilisent le drawer commun (576 px maximum, plein écran étroit, côté logique en RTL). Les matrices de permissions exposent la sélection partielle des groupes via `indeterminate`, gardent le nom des rôles système en lecture seule et protègent les brouillons à la fermeture. Les actions destructives demandent une confirmation nommée ; leurs erreurs restent visibles dans le contexte de l’action. Les fiches mobiles conservent leur bordure, y compris la dernière ligne du tableau.

## Accès et bibliothèques catalogue

Les pages d’accès partagent le wordmark C2 et le symbole C2 dans AccessShell. Le nom de marque n’est pas un titre de page : chaque étape ou résultat possède son propre h1. Les mots de passe et codes conservent leur saisie et disposent d’un contrôle de visibilité nommé. Les plateformes POS utilisent des radios natives.

Les bibliothèques internes utilisent les tableaux/cartes adaptatifs et des actions nommées de 44 px. Les éditeurs ont un pied fixe séparé de leur contenu défilant, une erreur persistante et une confirmation d’abandon du brouillon. Les variables de modèles restent isolées en LTR ; le texte des consignes adopte sa propre direction. Les catégories restent des libellés internes ; les modificateurs conservent des deltas de prix.

### Horaires et confirmations ouvertes depuis un menu

Les horaires utilisent un éditeur commun avec labels natifs, défilement contenu et états par jour. Un jour absent reste indisponible ; une fermeture antérieure à l’ouverture est présentée comme le lendemain, conformément au serveur. Les confirmations issues d’un menu peuvent recevoir la référence explicite du déclencheur pour restaurer le focus après démontage du menu.

## Sélections et variantes d’article

Les groupes de carte utilisent un dialogue de recherche avec cases à cocher, distinct de la catégorie interne (sélecteur natif). Les puces sélectionnées possèdent des boutons de retrait séparés du déclencheur : aucun bouton imbriqué. Les variantes passent en lignes de formulaire sur mobile, avec noms, prix absolus, portions, état et indicateur « combo seul » explicitement étiquetés. La réorganisation reste disponible au clavier. Choisir un jeu d’options enregistré remplace les variantes du groupe courant dans le brouillon et l’annonce avant sélection.

Les confirmations de changement de type et le détail d’économies réutilisent le dialogue commun pour le focus et le défilement. Les calculs d’économies ne changent pas. Les variantes et sélecteurs sont partagés entre création et édition ; leurs autres consommateurs doivent rester couverts par les tests de régression.


## Recette et disponibilité de l’article existant

Les instructions utilisent des champs nommés, une grille d’une colonne sur mobile et deux colonnes sur desktop ; les descriptions restent redimensionnables. Les quantités par variante gardent un tableau à défilement horizontal contenu, plutôt que de réduire les textes. Les préférences de multiplicateur sont cloisonnées par restaurant et article. Les sources « ingrédient brut » et « préparation » restent distinguées par texte et icône ; leurs explications et leurs créations restent accessibles directement dans la recette.

La création utilise le dialogue commun avec focus initial, focus contenu et retour au déclencheur. Le coût de préparation utilise le fond bleu produit de la landing. Une fiche créée partiellement verrouille ses champs et propose de reprendre les écritures restantes ; sa fermeture indique qu’elle reste dans la bibliothèque. Les unités et conversions, prix, rendement, durée de vie et calculs de coût conservent leurs contrats existants.

Les panneaux recette et disponibilité restent montés après la première visite. Changer d’onglet ne perd plus les modifications en attente. La fermeture distingue les champs non enregistrés des images, modificateurs et ingrédients immédiatement enregistrés. Les erreurs d’instructions et de règles affichent une nouvelle tentative ; elles ne sont plus rendues comme une liste vide.


## Images IA et revue d’import

L’image IA emploie le dialogue commun : modes explicites, consignes dans leur propre direction, choix de modèle, aperçu et validation séparés. Le bouton « Utiliser cette image » indique sa persistance immédiate sur l’article. Les actions en cours bloquent la fermeture ; une erreur conserve le dernier aperçu et la saisie. La gestion des modèles ouvre un autre onglet pour préserver l’article en cours. Les contrôles actifs utilisent `--brand-ink` sur `--brand-soft`, y compris en thème sombre.

La revue d’import utilise une source repliable et un formulaire de vérification côte à côte sur grand écran, empilés sur mobile/tablette. Les instructions et rendements éditables concernent les préparations ; l’import article enregistre seulement les ingrédients, conformément à son contrat. Lorsque plusieurs recettes sont extraites, un sélecteur explicite permet d’en choisir une ; changer la sélection remplace les corrections affichées. Les liens de stock restent modifiables et peuvent être retirés pour créer un nouvel ingrédient.

Les confirmations détaillent ce qui sera remplacé. L’extraction n’enregistre rien dans la recette. Une confirmation réussie suivie d’un échec de rafraîchissement verrouille le formulaire et reprend uniquement le rafraîchissement. Les fichiers locaux utilisent une URL d’objet libérée au changement de fichier et au démontage.
