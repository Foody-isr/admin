# Revue : configuration Admin du programme fidélité

Tranche locale du 1er novembre 2026, suite du suivi de paiements. Rapport consolidé : `output/wallet-loyalty/lot3l-validation.json`. Aucun environnement réel, programme de restaurant ou Wallet n’est activé.

## Parcours et continuité visuelle

L’écran `/[restaurantId]/loyalty/program` reprend le plan visuel du suivi précédent : composants Foody `PageHead`, `Card`, `Field`, `Input`, `Select`, `Textarea`, `BooleanInput`, `Badge` et `ConfirmDialog`, palette existante jour/sombre, Arial/Heebo et direction RTL. Les deux cartes Acquisition/Récompense sont côte à côte sur desktop et empilées sur mobile. Les conditions des trois langues occupent des colonnes larges ou une pile mobile, chacune avec sa direction propre. Les champs numériques montrent la devise réelle et des montants décimaux. Aucun identifiant de requête ou secret technique n’entre dans le parcours opérateur. Les captures synthétiques desktop et mobile HE sombre ont été inspectées ; le défilement vertical conserve l’accès aux actions et il n’y a pas de débordement horizontal.

Le menu Programme de fidélité est visible par défaut avec les droits de paramètres. Un restaurant sans programme voit « Aucun programme configuré » et peut préparer les règles avant d’activer le programme. Le suivi financier garde son propre flag et ses permissions financières ; cette page utilise les droits de paramètres. Le serveur fournit la capacité actuelle `can_manage_program`, le verrou d’identité et la devise. Un champ de capacité absent signifie lecture seule. Les retraits de droits ou changements d’acteur ne sont pas contournés par le rôle mémorisé dans le navigateur.

## Contrat et reprise

Les appels et types sont centralisés dans `src/lib/api.ts`. Les contrôles de version, règles, montants, traductions et accusés sont dans `src/lib/loyalty-program.ts`. Une réponse incomplète reste une erreur. Les montants saisis en point ou virgule deviennent des centimes exacts sans calcul flottant approximatif. Les nouvelles valeurs commerciales et textes de conditions ne sont pas préremplis arbitrairement.

Le formulaire choisit points ou visites, seuil et minimum éligible, remise fixe ou produit simple/option de taille, validité et trois traductions. Les suppléments restent payants ; les combos et produits au poids sont exclus. Le catalogue respecte ses autorisations existantes ; une erreur est explicite et permet une relecture, sans demander un droit élargi. Un produit configuré non chargé n’est pas présenté comme définitivement supprimé. Le serveur vérifie toujours la propriété et l’état des références, et le parcours de vente reste responsable du prix/stock final.

Une confirmation explicite précède chaque enregistrement, activation ou suspension. Avant transmission, la requête complète avec UUID, identité du programme, révision, règles et traductions est écrite puis relue dans la session, sous restaurant/acteur. Une réponse perdue ou un échec inconnu conserve le même corps pour une reprise manuelle. Une corruption ou indisponibilité de stockage bloque l’écriture. Aucun PUT n’est automatique.

Un refus définitif conserve l’entrée et impose Recharger et vérifier. Cette action ne retire l’ancienne intention qu’après lecture fraîche réussie et ne transmet aucune nouvelle écriture. Après un accusé de succès, le client efface uniquement la bonne intention puis relit la version courante. Un ancien onglet ne peut pas écraser un programme de remplacement à la même révision : l’identité exacte est aussi liée à la demande. Un ancien accusé d’activation ne devient donc pas une réactivation si un responsable a suspendu le programme depuis. Une erreur d’effacement après succès est visible sans nier l’accusé connu. Une réponse de lecture perdue après un succès bloque l’édition jusqu’à une nouvelle relecture.

Après la première adhésion, le mode, la devise et les conditions acceptées restent verrouillés. Le nom peut changer ; les autres règles sont versionnées sans modifier les achats et avantages déjà émis. Une transition de programme, réacceptation des conditions ou réouverture de membre n’est pas exposée. Une suspension des règles inchangées reste possible après dérive de devise ou catalogue, sans réactiver un programme invalide. Le choix marketing ne fait pas partie de l’adhésion.

Les réponses et erreurs sont présentées avec des textes locaux fixes ; aucun message SQL/prestataire n’est affiché. La liste de produits, le formulaire et le journal ne passent pas à un autre restaurant ou acteur ; les événements de stockage/focus retirent le formulaire si la session a changé. Les données d’essai sont synthétiques.

## Aide et pilote interne

Les procédures d’activation et de mise en pause sont disponibles en FR/HE/EN dans le centre d’aide préparé pour cette version. Publier l’aide avec l’API, l’Admin et le Web compatibles. L’émission Apple Wallet et Google Wallet reste indépendante.

### Pilote FR

Ouvrir Programme de fidélité avec les droits de paramètres appropriés. Choisir Points ou Visites, le seuil et le minimum d’achat. Choisir Remise fixe et son montant, ou Produit offert et sa taille éventuelle parmi les articles autorisés. Renseigner le nom et les conditions en anglais, français et hébreu, avec une version explicite. Choisir Programme actif ou laisser suspendu, puis Enregistrer la configuration et confirmer. Une lecture seule ne propose pas d’écriture. Après une issue inconnue, Reprendre la demande d’origine ; après un refus, Recharger et vérifier avant une nouvelle confirmation. Aucun écran client d’adhésion ou ajout Wallet n’est disponible dans ce pilote Admin.

### Internal pilot EN

Open Loyalty program with the required settings access. Choose Points or Visits, its threshold and minimum eligible purchase. Select a Fixed discount and amount, or a Free product and its permitted size. Provide the name and enrollment terms in English, French and Hebrew with an explicit terms version. Choose Program active or keep it paused, then Save configuration and confirm. Read-only access cannot save. After an unknown outcome, Resume original request; after a rejection, Reload and review before a new confirmation. Customer enrollment and Wallet installation screens are outside this Admin pilot.

### פיילוט פנימי HE

פתחו את תוכנית המועדון עם הרשאות ההגדרות המתאימות. בחרו נקודות או ביקורים, סף הטבה וסכום רכישה מזכה מינימלי. בחרו הנחה בסכום קבוע או מוצר במתנה עם הגודל המותר. מלאו שם ותנאי הצטרפות באנגלית, בצרפתית ובעברית, עם גרסת תנאים מפורשת. הפעילו את התוכנית או השאירו אותה מושהית, שמרו ואשרו. הרשאת צפייה בלבד אינה מאפשרת שמירה. לאחר תוצאה לא ידועה המשיכו את הבקשה המקורית; לאחר דחייה טענו מחדש ובדקו לפני אישור נוסף. מסכי הצטרפות לקוח והוספה לארנק אינם חלק מפיילוט הניהול הזה.

## Validation et limites

Tests purs : décimales exactes, règles et traductions obligatoires, capacités absentes, accusé correspondant, séparation des intentions et droits de route distincts. Essais navigateur : visites/remise, points/produit avec option et activation explicite, lecture seule, verrouillage après adhésion, réponse perdue/rechargement/reprise identique, ancienne activation face à une suspension récente, refus périmé, stockage indisponible, changement d’acteur, erreurs masquées, FR/EN et mobile HE sombre, plus navigation visible par défaut sans écriture à l’ouverture. Le suivi financier précédent est rejoué en régression après les modifications communes.

Les cinq API permettent configuration, consultation et adhésion sous session client existante ; leur écran client Web reste à raccorder. Les cartes Apple/Google, scanner et contrôles POS, transitions et reprise depuis une autre session sans intention originale restent à livrer. Les validations locales et simulations ne constituent ni déploiement, ni acceptation sur téléphone/terminal réel. Aucun commit, push, déploiement, changement de `.env` réel, paiement ou message client n’est effectué.
