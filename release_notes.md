## ◉ DS STREAM — HEARTGOLD & SOULSILVER (V1.8)

Cette mise à jour corrige le bug le plus embêtant de l'application concernant les claviers qui se bloquent sous Windows ! ⌨🛡👾

### 🌟 Correctifs et Améliorations de la version 1.8 :
- **Résolution Totale du Blocage Clavier (Focus Freeze Fix) :**
  - **Le problème identifié :** Les fenêtres pop-up natives de Windows (comme les confirmations de remise à 0 ou les messages d'erreur de caméra) bloquaient le fil d'exécution de l'application et désactivaient complètement le focus du clavier sous Electron. Après avoir fermé un pop-up, il était impossible d'écrire dans les champs de texte ou de chercher un Pokémon sans devoir relancer l'application.
  - **La solution apportée :** Nous avons supprimé tous les pop-ups natifs et généré notre propre **système de fenêtres pop-up asynchrones** intégré à l'interface HTML !
  - **Résultat :** Les alertes et les confirmations s'affichent maintenant de manière fluide, asynchrone, dans un superbe cadre néon assorti au thème de l'application, et **votre clavier ne se bloquera plus jamais !**
- **Sécurité anti-perte de focus :**
  - Un écouteur de focus a été ajouté sur la fenêtre de l'application : dès que vous cliquez n'importe où dans l'application, le focus clavier est immédiatement recapturé, assurant une réactivité de frappe instantanée.
