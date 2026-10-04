# Notifications et WhatsApp — 4 octobre 2026

## Notifications

Page et push.ts lus, ainsi que PushResync/ServiceWorkerRegister, handlers Push au complet et routes serveur. Comparaisons de patterns : Sécurité, Équipe et modèles de messages. API utilisateur + restaurant ; garder settings.edit côté UI et test abonné disponible en lecture seule, comme précédemment. La liste serveur est filtrée utilisateur/restaurant et n’expose que des fins d’endpoint. L’upsert unique endpoint peut déplacer l’inscription au dernier restaurant synchronisé : limite backend conservée, aucune modification serveur.

Page isolée par rid, chargements navigateur/préférences/appareils indépendants avec erreur/reprise, labels/dates longs lisibles, liste mobile et RTL, préférences confirmées et mutations sérialisées. Les appareils d’autres navigateurs restent gérables même si le navigateur présent ne supporte pas Web Push. La présence d’un abonnement navigateur ne prouve plus seule l’inscription à l’établissement. Un test sans endpoint local est refusé avant l’API : un endpoint vide déclencherait sinon le broadcast historique à tous les appareils.

Le helper utilise getRegistration plutôt que ready, qui ne se résout pas sans worker. L’activation exige un worker actif et expose le refus de permission. Activation, réparation automatique et arrêt partagent une file de mutations. La réparation requiert un abonnement local déjà existant, ne recrée plus une inscription après désactivation et ne journalise pas les erreurs contenant potentiellement des endpoints. Rotation VAPID : l’échec de désinscription locale n’est plus masqué.

Retrait courant : DELETE serveur et arrêt local dans la même opération ; preuve de suppression conservée si l’arrêt local échoue, reprise locale seule. Désactivation : même si le serveur échoue, l’arrêt navigateur est tenté et les deux résultats restent distincts. Entrée serveur restante visible/retirable. Un verrou mémoire empêche la resynchronisation pendant la reprise locale ; il ne garantit pas l’absence de concurrence entre onglets ni après un rechargement forcé alors que l’arrêt local a échoué. beforeunload couvre une opération/reprise en cours, pas une garde SPA universelle. Pas de garantie d’idempotence après perte d’une réponse DELETE.

Tests : première passe 21/22, le seul échec concernait un sélecteur de statut trop large pendant les chargements. Corrigé, puis 22/22 en développement, exit 0, début 2026-10-04T10:28:32.441Z, durée 105651.606 ms. Résultats/captures `evidence/notifications-targeted-results.json`, FR mobile dont liste défilée et HE sombre effectivement inspectés. Types réussis. Compilation et passe compilée encore requises. Aucune vraie notification ni permission système sollicitée : Notification, SW, PushManager et HTTP sont synthétiques.

## WhatsApp : contrat vérifié

API existante et WhatsAppHandler/SenderResolver lus. SettingsView/Edit pour GET, SettingsEdit pour POST/DELETE. Connect crée un expéditeur chez Twilio avant l’upsert local : il n’est pas transactionnel ni garanti idempotent. Une réponse perdue doit être vérifiée par GET avant toute nouvelle tentative. Même si GET est vide, un effet externe peut déjà avoir eu lieu. DELETE retire uniquement la ligne Foody, sans supprimer compte/expéditeur chez Meta ou Twilio. GET ne consulte Twilio que pour les états non terminaux ; ONLINE/OFFLINE/FAILED retournent l’état enregistré.

OTP : RestaurantSettings.OTPMode est l’interrupteur général. GuestOTPRequired/guestOTPRequirements et GuestOTPEnabled lus : skip désactive les codes retrait/livraison ; required ou historique vide consulte ensuite checkout_config publié, dont require_auth peut désactiver par parcours. Le dine-in n’exige pas OTP par ce mécanisme. La nouvelle copie respecte cette nuance ; elle ne reprend ni les anciens coûts approximatifs non issus d’un contrat API, ni la promesse de protection maximale contre la fraude. Aucun comportement serveur, paiement, authentification ou modèle de message modifié.

Page keyed rid, états GET séparés, valeurs OTP confirmées, polling séquentiel sans chevauchement et interrompu après erreur, anciennes réponses invalidées lors des mutations. États longs, formulaires et dialogues traduits FR/EN/HE. Inscription : SDK prêt avant clic pour préserver le geste utilisateur d’ouverture de fenêtre ; erreurs récupérables. FINISH accepté seulement pendant une inscription explicitement lancée, depuis HTTPS facebook.com ou ses sous-domaines, avec IDs non vides. Les événements non sollicités, après annulation ou après première réception sont ignorés. Le SDK ne fournit pas ici de nonce corrélable au popup ; l’origine et la session active sont vérifiées, pas une preuve serveur de propriété supplémentaire.

Numéro international sans pays inféré, nom public revus, champs gelés pendant écriture, GET de réconciliation après échec. Une association retrouvée est présentée à vérifier ; aucune nouvelle inscription automatique. Si GET échoue, seule la vérification est proposée ; si GET est vide, relance avec confirmation expliquant l’effet externe possible. Abandon de formulaire confirmé, étapes Meta/Twilio déjà réalisées explicitement non annulées. Déconnexion confirmée avec portée Foody.

Trois tests unitaires de validation origin/payload/téléphone passent. Tests navigateur en cours ; routes Notifications/WhatsApp non comptées tant que preuve compilée manquante. Variables publiques Meta/Twilio **synthétiques uniquement dans le serveur de test** ; aucun fichier .env modifié. SDK/HTTP interceptés et domaine externe bloqué, aucune vraie association ni envoi.

## Première validation finale

WhatsApp : 17/17 passent en développement, exit 0, début 2026-10-04T10:41:41.774Z, durée 155743.973 ms. La première passe avait été interrompue après constat d’un nom accessible incluant l’aide du champ téléphone ; correction aria-label + aria-describedby, puis nouvelle passe complète. Captures revue FR mobile et connexion HE sombre inspectées.

Validation complète Notifications + WhatsApp exit 0 : 603 tests configurés, 6 286 clés FR/EN/HE, lint (23 avertissements), types, build. La passe compilée de 39 scénarios est en cours. Les identifiants publics Meta/WhatsApp/Twilio de la compilation de prévisualisation sont synthétiques, fournis en arguments de commande, aucun fichier env modifié. Toute reconstruction pour les tests WhatsApp doit conserver ces trois valeurs de test. Ce build local ne constitue pas un artefact de déploiement autorisé.

## Notifications et WhatsApp — lot ciblé compilé

Validation complète exit 0 : **603 tests configurés**, **6 286 clés** FR/EN/HE, lint (23 avertissements), types et build. **39 scénarios compilés réussis**, 0 échec/skip/flaky ; début 2026-10-04T10:49:26.314Z, durée 112510.852 ms. Preuves : `evidence/notifications-whatsapp-compiled-results.json`. Captures compilées Notifications HE sombre, liste mobile FR et connexion WhatsApp mobile FR inspectées ; revue mobile et HE WhatsApp inspectés aussi au ciblage.

22 scénarios Notifications et 17 WhatsApp, tous isolés : reprises/permissions, défaut de worker, sérialisation avec réparation, phase locale après retrait serveur, aucun test push sans endpoint ; provenance Meta, brouillon/identité, perte de réponse, GET seul, double clic, déconnexion, OTP et statut périmé. Trois tests unitaires de validation supplémentaires. Les valeurs publiques de Meta/Twilio fournies au build sont synthétiques ; aucun vrai SDK, abonnement, message ou paiement appelé.

**61/102 routes** documentées, souvent partiellement migrées ; **41 encore inventoriées**. Le dernier checkpoint **global** demeure **351** ; les passes ciblées postérieures ne sont pas additionnées comme une régression globale. Audit et limites : `notifications-whatsapp-audit.md`.
