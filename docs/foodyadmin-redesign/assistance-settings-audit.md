# Assistance IA et service à table — lecture préparatoire

État au début de la lecture préparatoire : aucune modification de ces deux pages. Pages complètes lues et comparaison avec les formulaires refondus de paramètres généraux/stock et Notifications.

## Assistant IA

Page actuelle : GET sans catch, pas de retry, aucune protection au changement de restaurant/locale, switch non nommé/RTL, champs encore éditables en lecture seule, sauvegarde sans catch/verrou/baseline ni garde de brouillon. Champs masqués par disabled visuel mais accessibles clavier via pointer-events-none. Choix trigger/delay et textes doivent être conservés lorsque l’assistant est désactivé. Fallbacks UI historiques false/true/true/manual/45 et limites client 1000/4000/4000/6000, délai 0..600.

RestaurantSettings/API et UpdateSettings serveur lus (service.go 684–735). Payload contient neuf champs AI : enabled, upsell, auto_order, guidance, aliases, pairings, faq, trigger, trigger_delay. Trigger accepte manual/immediate/delay, délai négatif ramené à zéro serveur, pas de plafond serveur. Les limites de texte et plafond 600 sont uniquement ceux de l’UI existante ; ne pas tronquer les valeurs historiques à la lecture. Handler public substitue 45 si trigger_delay <=0, tandis que l’admin peut sauver 0 : écart existant à documenter, pas modifier le serveur pour le masquer. Il reste à lire le consommateur guest et la validation/consommation IA pour confirmer l’effet des autres champs. Tests entièrement synthétiques, aucune inférence IA réelle.

## Service à table

API get/updateServiceGuidanceRules et handlers/service ListRules/SaveRules lus. Deux slots obligatoires check_in/offer_dessert, bornes delay 1..180, overdue 1..120, types distincts. ListRules retourne les deux slots, defaults désactivés seulement si absents en base. SaveRules écrit les deux dans une transaction puis fait un GET ; enabled_at changé uniquement lors d’une transition false→true et retiré quand désactivé. GET des tâches, pas SaveRules, effectue reconcile et crée/annule les tâches. Settings limites demandes 1..20 et fenêtre 1..60 vérifiés. Routes view/edit restaurant explicite.

Page actuelle : Promise.all GET puis erreur mais formulaire de valeurs par défaut toujours sauvegardable ; règles ignorées silencieusement si nombre différent de deux ; effet dépend de t et peut écraser un brouillon lors d’un changement de langue. Sauvegarde Promise.all entre politique settings et règles = deux écritures indépendantes pouvant réussir partiellement sans reçu individuel. Contrôles restent actifs pendant sauvegarde, pas de verrou instantané, le retour écrase les saisies concurrentes ; pas de garde de fermeture. Prévoir validation explicite des règles, brouillons et deux baselines/confirmations pour ne pas répéter une phase déjà enregistrée. L’API UpdateSettings sauvegarde settings puis restaurant séparément : une erreur peut survenir après première écriture, ne pas revendiquer atomicité globale.

## Marque (lecture seulement)

Page Branding entière lue : name/description/logo_url sont sauvegardés, mais short_tagline/couleurs/polices sont des états locaux sans persistance et donnent une fausse impression d’enregistrement. La disposition 200px+1fr déborde sur mobile, changement logo via prompt natif, logo object-cover. Aucun changement appliqué. Avant refonte, vérifier le contrat d’identité et l’autorité des réglages Website V3/V2/legacy ; ne pas écrire arbitrairement dans une configuration legacy qui n’est pas consommée, ni traiter le logo du restaurant comme le logo Foody C2.

## Commandes (lecture initiale seulement)

opening-hours et scheduled-orders redirigent vers orders/availability et orders/preorders. orders/page et orders/[section] utilisent OrdersSettingsWorkspace (1715 lignes), OrderWorkflowBuilder (753) et _components (323). Seules les 135 premières lignes du workspace et wrappers ont été lus. Aucun changement, aucune route comptée.

Suite de lecture IA : aiorder/handler.go transmet les neuf paramètres et refuse le chat si enabled=false. aiorder/service.go conditionne outils place_order/consignes aux flags auto_order/upsell ; guidance/aliases/pairings/FAQ sont ajoutés comme connaissances dans le prompt. foodyweb OrderExperience 1060–1106 confirme : nudge une fois par session, panier vide, assistant pas déjà ouvert, suspendu pour tournée ; immediate attend 600 ms, delay utilise la valeur reçue (mais handler public remplace zéro par 45). API guest mapper utilise ??45. Ne pas modifier ces comportements dans la refonte admin.

NumberInput existant conserve son buffer et borne sur change/blur ; defaultFormat(0) rend une chaîne vide. Pour le délai zéro qui est une valeur métier, passer format={String}. Les champs obligatoires bornés doivent rester de vrais contrôles nommés et utiliser les descriptions séparées du label (Field inclut autrement hint dans le nom accessible).

## Sources appliquées

Les pages Assistant IA et Service à table sont réécrites, keyed rid, erreurs/reprises explicites, verrous synchrones et générations de requêtes, baselines, état modifié, annulation confirmée et garde beforeunload/liens internes. Retour navigateur et navigation programmée restent hors garde globale. Le changement de langue ne déclenche plus le GET. Champs texte/numériques en lecture seule restent copiables, sans simple pointer-events-none.

Assistant IA : payload limité aux neuf propriétés possédées, valeurs false/vides/zéro conservées, texte et délai historiques supérieurs aux bornes UI non tronqués, réglages enfants conservés lorsque désactivé. Badge reflète l’état sauvegardé ; le commutateur représente le brouillon. Le zéro reste visible et le comportement actuel du site client (45 s) est expliqué. Aucun moteur IA, prompt système, commande ou paiement réel appelé.

Service à table : règles exactement check_in/offer_dessert validées à la lecture ; réponse incomplète n’est pas remplacée silencieusement par des defaults. Sauvegarde séquentielle des APIs uniquement si leur brouillon diffère : la politique confirmée devient baseline avant l’envoi des règles, une reprise n’envoie que la phase restante. Champs gelés durant la mutation. Reset revient aux dernières phases confirmées, pas à une ancienne photographie qui annulerait implicitement une sauvegarde partielle. Idempotence après réponse perdue non garantie au-delà des upserts existants.

Types et diff --check réussis. Dix-neuf scénarios navigateur ont été ajoutés ; exécution ciblée en cours. Ces deux routes ne sont pas encore comptées. Les scripts /tmp/foody-ai-settings-page.tsx et /tmp/foody-table-assistance-page.tsx ont été appliqués, mais le premier est désormais légèrement obsolète (badge traduit spécifiquement).

## Assistant IA et Service à table — validation ciblée compilée

Validation complète exit 0 : **603 tests configurés**, **6 292 clés** FR/EN/HE, lint (23 avertissements), types et build. **19/19 scénarios compilés réussis**, 0 échec/skip/flaky ; début 2026-10-04T11:11:03.684Z, durée 38012.693 ms. Preuve : `evidence/assistance-settings-compiled-results.json`. Captures compilées Service à table FR mobile et Assistant HE sombre inspectées, avec les autres captures ciblées du lot.

Conservation des champs désactivés/masqués et valeurs historiques, reprise de chargement, double soumission, lecture seule, changement de langue, garde de brouillon et sauvegarde partielle sont couverts. Aucun appel IA ou tâche de service réel. Limites de comportement serveur documentées dans `assistance-settings-audit.md`. **63/102 routes** documentées, souvent partiellement migrées ; **39 encore inventoriées**. Le dernier passage global demeure **351** ; les passes ciblées restent séparées. Paiements et Cibus sont en cours.
