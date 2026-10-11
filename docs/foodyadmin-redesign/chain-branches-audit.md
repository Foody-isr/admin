# Gestion des établissements — 4 octobre 2026

Route `/[restaurantId]/chain/branches`, deuxième surface du lot local suivant PR#452. Le premier lot demeure disponible en développement ; cette page retravaillée n’est pas encore publiée.

## Présentation et parcours

Synthèse de l’enseigne dans le panneau bleu Foody, état réel de la commande globale, site principal et liens publics. Cartes d’établissements avec identité, coordonnées, responsable, modes de commande et configuration de publication dépliable. Configuration inconnue et horaires non renseignés restent distincts de valeurs à zéro ou d’une configuration prête. Les horaires structurés sont reconnus via le booléen serveur lorsque leur résumé textuel est vide. Les états actif, publié, masqué, configuration et archivé sont distingués.

Éditeur partagé : création de l’enseigne en deux étapes ; nouvelle succursale en quatre étapes (coordonnées, copie indépendante du catalogue, responsable facultatif, récapitulatif) ; modification de l’identité globale/site principal ; identité publique/interne de l’établissement. Labels associés, URLs en LTR, textes métier isolés en bidi, radios natifs, progression traduite, focus et fermeture Radix. Entrée avance dans l’assistant sans créer prématurément. L’e-mail est validé à l’étape du responsable.

Les brouillons restent stables au rafraîchissement et après erreur. Fermeture avec modifications : confirmation ; pendant écriture : formulaire et fermeture bloqués, protection avant rechargement navigateur. Les doubles clics sont sérialisés par verrou synchrone. Les liens globaux de navigation SPA restent soumis à la limite commune de l’application : pas de garde de navigation universelle.

## Données et mutations

Les identités et IDs uniques de l’overview sont contrôlés, ainsi que la présence du restaurant courant dans une liste non vide. Un échec de lecture ne propose plus de créer une nouvelle enseigne. Un changement de restaurant remonte le composant et ses brouillons ; les réponses périmées ne remplacent pas la liste courante.

- Identité/publication/création : contrats existants sous `/api/v1/chain`, avec `X-Restaurant-ID` courant.
- Modification d’une succursale : `/chain/branches/:id` avec le contexte courant et l’identité cible.
- Invitation : `/restaurants/:id/staff/:userId/resend-invite`, contexte de la succursale cible. Son résultat e-mail est présenté séparément ; aucune invitation n’est envoyée pendant les tests.
- Les écritures d’identité et de publication exigent l’owner réel côté service Go. La page affiche désormais ces commandes pour le rôle restaurant `Owner`. Un rôle personnalisé `chain.manage` garde la consultation, avec explication. Aucun bypass Super Admin n’est inventé. Le serveur reste l’autorité des accès, notamment `staff.manage` de la succursale pour l’invitation.
- L’activation globale est proposée lorsqu’au moins une succursale active/live est prête selon le serveur. La publication individuelle continue d’utiliser `publication_checklist.ready`.

Une écriture confirmée puis une lecture échouée ne rouvre pas le formulaire et ne répète pas l’écriture : seule la liste est relue. Une modification non confirmée conserve le brouillon et exige une vérification GET. Si les données sauvegardées correspondent, le formulaire se ferme ; sinon le brouillon reste modifiable. Les champs optionnels vides omis par Go sont comparés comme des chaînes vides.

Une création non confirmée peut avoir déjà persisté et déclenché une invitation. Aucun nouveau POST n’est proposé dans le même formulaire : vérification de la liste puis retour à la consultation. Une création n’annonce pas une réception d’e-mail, car `CreateBranchResult` ne fournit pas son statut de livraison. Une invitation non confirmée affiche un message distinct et n’est pas répétée automatiquement.

## Vérification

21 scénarios isolés passent en mode développement : FR mobile, HE sombre, formulaires mobiles, liste absente/malformed, owner/manager, inconnues, sauvegarde avec contexte restaurant2, double clic/fermeture, reprises appliquées et non appliquées, réponse GET perdue après PATCH, validation par étape, création/catalogue/responsable, création incertaine, conversion standalone, site principal, publication globale/individuelle, invitation cible, champs vides omis. Captures liste et formulaires réellement inspectées. Résultat `evidence/chain-branches-dev-results.json`.

Lint complet, types et build réussis ;20 avertissements de lint préexistants. 632 tests unitaires passent ;6696 clés i18n synchronisées. Vérification compilée conjointe des deux pages de chaîne :38/38 passent, dont21 établissements. Début2026-10-04T16:47:41.014Z, durée22517ms. Résultat `evidence/chain-compiled-results.json`. Captures finales conservées dans evidence.

## Limites

Pas de garantie d’idempotence serveur après fermeture/rechargement : l’API de création ne possède pas de clé d’idempotence ni d’identifiant d’opération. Le parcours permet de consulter la liste avant une nouvelle création, sans prétendre identifier une opération perdue par simple comparaison de nom. Les e-mails, essais d’abonnement et copies de catalogue réels ne sont pas validés par le harnais. Les règles serveur et les effets après transaction n’ont pas été modifiés.

Les accès de chaque cible restent validés côté serveur. Le service de création existant n’applique pas exactement les mêmes vérifications d’ownership que les autres mutations de chaîne ; la restriction d’interface ne constitue pas une correction de l’API. Les rôles propriétaires atypiques et les changements d’accès en session nécessitent une vérification d’intégration dédiée. Cette route reste partielle dans l’inventaire.
