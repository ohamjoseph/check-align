# Align-Check 🔍

[Align-Check](index.html) est un outil local simple et puissant développé en Vanilla JS et Tailwind CSS pour vérifier l'alignement de textes parallèles (corpus bilingues) ligne par ligne.

[![Interface Align-Check](https://img.shields.io/badge/UI-Tailwind_CSS-38bdf8?style=for-the-badge&logo=tailwindcss)](index.html)
[![JavaScript](https://img.shields.io/badge/Logique-Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript)](app.js)

## 📌 Fonctionnalités

*   **Affichage Côte à Côte** : Visualisez instantanément vos données sources et cibles dans une interface ergonomique.
*   **Analyse du Ratio de Mots** : L'algorithme calcule le ratio de mots entre la source et la cible pour chaque ligne. Une ligne source trop longue par rapport à sa cible (ou inversement) déclenche une alerte visuelle (couleur rouge ou orange).
*   **Détection Multi-phrases** : Identifie automatiquement si une ligne contient plusieurs phrases (grâce à la ponctuation `.` `!` `?` suivie d'un espace) pour repérer les erreurs de fusion de lignes.
*   **Alerte de Ligne Manquante** : Détecte si un fichier est plus long que l'autre, signalant les lignes "Source seule" ou "Cible seule".
*   **100% Local et Sécurisé** : L'application fonctionne entièrement dans votre navigateur grâce à l'API `FileReader`. Vos données ne sont jamais envoyées sur un serveur.
*   **Design Moderne** : Thème sombre élégant avec du *Glassmorphism* optimisé avec Tailwind CSS en plein écran.

## 🚀 Utilisation

Aucune installation complexe ni serveur n'est requis ! 

1.  Clonez ou téléchargez ce dépôt sur votre machine.
2.  Double-cliquez sur le fichier `index.html` pour l'ouvrir dans votre navigateur web (Chrome, Firefox, Safari, Edge...).
3.  Dans l'interface, cliquez sur les boutons **Source (.txt)** et **Cible (.txt)** pour charger vos fichiers de corpus.
4.  L'analyse se lance automatiquement. Vous pouvez inspecter les alertes générées dans la colonne centrale.

## 🛠️ Fichiers de test

Pour tester l'application immédiatement, deux fichiers de démonstration sont inclus :
*   `test_source.txt`
*   `test_target.txt`

Chargez ces deux fichiers pour voir l'application détecter les décalages, les phrases multiples et les problèmes de ratio.

## 💻 Stack Technique
*   **HTML5**
*   **CSS** : Tailwind CSS (intégré via CDN pour une portabilité maximale) + propriétés CSS natives (Scrollbars).
*   **JavaScript (ES6)** : Manipulation du DOM, FileReader, Regex.

---
*Conçu pour faciliter la préparation temporelle et structurelle des corpus d'apprentissage Machine Learning (NLP/NMT).*
