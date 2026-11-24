const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * N'embarque que les architectures ARM dans l'APK.
 *
 * POURQUOI UN PLUGIN ET PAS UN REGLAGE EAS
 *
 * On avait d'abord essaye, dans eas.json :
 *     :app:assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
 * Mesure faite sur l'APK produit : aucun effet, lib/x86 et lib/x86_64 etaient
 * toujours la, 34,8 Mo a eux deux.
 *
 * La raison est que « reactNativeArchitectures » ne pilote que ce que React
 * Native COMPILE depuis les sources. Or depuis la version 0.76, React Native
 * livre libreactnative.so et libhermes.so deja compiles, pour les quatre
 * architectures, dans son AAR. Et les bibliotheques tierces font pareil :
 * libbarhopper_v3.so, le moteur de lecture de code-barres de Google utilise
 * par expo-camera, pese a lui seul 19,3 Mo repartis sur les quatre.
 *
 * Le seul levier qui agit sur des binaires deja compiles est abiFilters, qui
 * dit a Gradle quelles architectures RECOPIER dans l'APK, d'ou qu'elles
 * viennent.
 *
 * x86 et x86_64 ne servent qu'aux emulateurs Android : aucun terminal de
 * vente n'en a. On garde les deux ARM, ce qui laisse UN seul APK a
 * distribuer, compatible 32 et 64 bits.
 *
 * Effet de bord a connaitre : l'APK ne s'installera plus sur un emulateur
 * PC. Pour en refaire un qui le permette, il suffit de retirer ce plugin de
 * la liste « plugins » dans app.json.
 */

const ARCHITECTURES = ['armeabi-v7a', 'arm64-v8a'];

const BLOC_NDK = `
        // Ajoute par plugins/abi-arm-seulement.js -- voir ce fichier.
        ndk {
            abiFilters ${ARCHITECTURES.map((a) => `'${a}'`).join(', ')}
        }`;

module.exports = function withAbiArmSeulement(config) {
  return withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;

    // Idempotent : prebuild peut tourner plusieurs fois sur le meme dossier.
    if (gradle.includes('abiFilters')) {
      return config;
    }

    // On vise le defaultConfig du module app. Echouer bruyamment vaut mieux
    // que produire en silence un APK de 84 Mo en croyant l'avoir allege.
    const ancre = gradle.match(/defaultConfig\s*\{/);
    if (!ancre) {
      throw new Error(
        "abi-arm-seulement : bloc defaultConfig introuvable dans android/app/build.gradle. " +
          "Le gabarit Expo a change : il faut mettre ce plugin a jour."
      );
    }

    const position = ancre.index + ancre[0].length;
    config.modResults.contents =
      gradle.slice(0, position) + BLOC_NDK + gradle.slice(position);

    return config;
  });
};
