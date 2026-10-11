# Paiements et Cibus — audit de contrat et refonte en cours

Pages héritées entièrement lues ; comparaison avec paramètres généraux, Stock, Assistant IA et WhatsApp. Pas de mutation serveur, de paiement, de connexion fournisseur ni de vraie donnée dans les tests. Modifications limitées au checkout admin isolé.

## Cibus : identité complète, pas PATCH

GET/PUT dans api.ts, handlers admin 647–710, service 1493–1533, encryptPtr, maskString, ProviderResolver.buildCibusService et Cibus.IsConfigured lus. Le GET ne retourne que enabled et trois suffixes masqués. enabled signifie que Cibus est le fournisseur sélectionné, pas qu’un paiement ou le terminal a été testé. Le PUT exige que le fournisseur soit déjà sélectionné dans le backoffice ; il remplace les trois colonnes via Updates(map). Une propriété omise devient nil et efface la valeur existante. L’aide héritée « laisser vide pour conserver » est donc fausse.

La refonte prépare un remplacement complet, explicitement confirmé, avec les trois valeurs obligatoires, masquées pendant la saisie, sans réutiliser les suffixes comme valeurs. Les identifiants restent des chaînes (zéros initiaux préservés), validées comme entiers positifs représentables par le consommateur Go 64 bits. Aucun identifiant en clair dans les messages, stockage navigateur, URL ou journaux. Effacement immédiat du brouillon après accusé du PUT ; un échec de relecture propose GET seul, sans renvoyer ce PUT. Si l’accusé du PUT est perdu, le brouillon est conservé avec un message de confirmation absente ; la prochaine action reste un remplacement explicitement confirmé. Aucun test de terminal inventé.

Revue sécurité inter-services par lecture : routes protégées par AuthMiddleware et RequirePermissions(settings.view/edit pour GET, settings.edit pour PUT), résolution de l’établissement par paramètre id en l’absence de contexte, ownership/permissions DB et bypass superadmin explicite. Le client API conserve id dans l’URL et X-Restaurant-ID. Aucun affaiblissement du middleware ni nouveau contrat. Ces contrôles ont été lus, pas exécutés contre le serveur réel.

## Paiements : distinguer réglages persistants et maquette

Lecture SettingsInput, buildSettingsResponse, UpdateSettings, modèle RestaurantSettings, ProviderResolver.weightHoldBufferPercent, online_payment_only serveur et TIP_OPTIONS guest. Le modèle contient la marge au poids, mais **SettingsInput, UpdateSettings et buildSettingsResponse ne la prennent pas en charge**. L’ancien formulaire affichait 20 et envoyait un champ ignoré. La marge est maintenant consultable uniquement si réellement fournie, sinon inconnue ; édition indisponible explicitement, aucune nouvelle règle bancaire appliquée.

online_payment_only est accepté et persisté mais **omis de buildSettingsResponse**, pour GET comme PUT. L’ancienne UI retombait silencieusement à false, puis pouvait réécrire false lors d’un changement de TVA. La refonte conserve undefined comme état inconnu et n’envoie ce champ qu’après un choix explicite. Une réponse sans ce champ conserve le choix explicitement confirmé dans la session. Au rechargement, l’état redevient inconnu tant que l’API ne l’expose pas. Pas de fallback public : GetPublic ignore une erreur interne de GetSettings et peut alors annoncer false, ce qui n’est pas une source fiable pour modifier une politique de paiement.

TVA et tips_enabled sont retournés et persistés ; le formulaire exige une réponse de forme valide, conserve zéro et décimales, et n’envoie que les propriétés modifiées. Les taux particuliers par article demeurent inchangés. Les taux prétendument « réduits/exonérés selon catégorie », les arrondis et les trois suggestions de pourboire étaient statiques ou locaux sans persistance. Ils ne deviennent pas de nouvelles fonctions métier : les contrôles factices sont remplacés par une indication exacte des réglages disponibles. Le guest a sa propre liste de pourboires [0,5,10,12,15,20], inchangée. Aucun conseil fiscal ni statut fournisseur inventé.

Les états actifs carte/wallet, inactifs Bit/Cibus et boutons configurer/connecter étaient codés en dur, sans données ni action. Ils deviennent une explication de la gestion des fournisseurs et un lien réel vers Cibus. Aucun appel à un endpoint backoffice privilégié n’est ajouté. Aucune modification de paiement, resolver, calcul fiscal ou fournisseur dans les autres services.

## Limites à corriger séparément côté métier

- Renvoyer online_payment_only dans les réponses settings (lecture fiable après rechargement).
- Ajouter un vrai contrat de lecture/écriture de weight_hold_buffer_percent si le produit veut l’exposer dans cette page ; la refonte ne le simule pas.
- Clarifier le remplacement complet Cibus côté API ou implémenter explicitement un PATCH dans une mission serveur séparée.
- Pas de transaction entre settings et restaurant dans UpdateSettings ; une erreur peut suivre une première écriture réussie. Aucune promesse d’atomicité ou d’idempotence de transport.
- Garde beforeunload et liens internes du formulaire ; retour navigateur et navigation programmée hors garde globale.

Les deux routes ne sont pas encore comptées : sources préparées, vérification navigateur à suivre.

## Sources et première preuve ciblée

Les pages sont appliquées, avec leurs layouts mobiles et liens de navigation rendus accessibles sur téléphone. Types réussis après correction de la déclaration des options du fixture (pas une erreur produit). 23/23 scénarios dev passent : début 2026-10-04T11:21:06.392Z, durée 248774.115 ms ; preuve `payment-settings-targeted-results.json`. Le premier passage (20/23) révélait la barrière DesktopOnly héritée et deux assertions dépendant du double montage dev ; il est conservé séparément.

Captures réellement inspectées : Paiements FR mobile et Cibus HE sombre. Option de paiement raccourcie ensuite pour ne pas tronquer le sens sur mobile. Le champ de mot de passe partagé aligne maintenant la direction de son conteneur interne avec celle de son input, pour éviter le chevauchement entre bouton de visibilité RTL et identifiants LTR ; label extérieur garde la direction de l’interface. Deux captures complémentaires (bas Paiements FR et identifiant révélé HE) et un contrôle de position ont été ajoutés pour le passage compilé. Build/régression globaux à suivre ; routes pas encore comptées.

Validation finale : intégré à la régression globale compilée 505/505, exit 0, voir verification.md. Captures compilées et résultats archivés.
