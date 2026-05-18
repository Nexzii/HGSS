## ◉ DS STREAM — HEARTGOLD & SOULSILVER (V1.5)

Cette version corrige le **bug critique de clonage et de synchronisation des compteurs en mode Duo P2P** (Câble Link) ! 👾🐛⚡

### 🌟 Correctifs et Améliorations de la version 1.5 :
- **Routage P2P Parfait (Fin du bug de clonage) :** 
  - Auparavant, le rôle de l'émetteur (`role`) n'était pas envoyé dans les messages de synchronisation P2P. Le récepteur interprétait donc tous les messages entrants comme appartenant à Player 2, clonant ainsi les Pokémon et écrasant les compteurs de SoulSilver à tort.
  - **Résolution :** L'émetteur envoie désormais son rôle explicite (`host` pour P1 ou `joiner` pour P2). Le récepteur route les informations vers la bonne console (HeartGold ou SoulSilver) sans aucune collision !
- **Indépendance des Compteurs :** Le compteur de l'hôte contrôle uniquement l'écran HeartGold, et celui de l'invité contrôle uniquement l'écran SoulSilver. Tu vois son compteur évoluer en temps réel sans jamais affecter le tien !
- **Intégration d'Auto-Updater :** La version est officiellement taggée à `v1.5` pour signaler à tous tes amis qu'ils peuvent télécharger la mise à jour corrective en direct via le bouton du launcher !
