package expo.modules.bluetoothprinter

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * Impression sur les terminaux dont l'imprimante integree se presente comme une
 * imprimante Bluetooth deja appairee (vue sur un BROLEO : « 4G_Printer »).
 *
 * Rien a voir avec les trois autres pilotes. Ici il n'existe aucun service
 * Android a qui demander d'imprimer : le terminal expose une liaison serie sur
 * Bluetooth, et c'est a nous de composer les commandes ESC/POS. Ce module ne
 * fait donc que deux choses -- ouvrir la liaison, et ecrire des octets. Les
 * commandes elles-memes sont fabriquees en TypeScript (voir pilotes/escpos.ts),
 * ou elles se lisent et se corrigent sans recompiler le natif.
 *
 * Seule exception : la conversion d'une image en trame noir et blanc, faite
 * ici parce qu'elle demande de decoder un bitmap.
 */
class BluetoothPrinterModule : Module() {

  companion object {
    /** Profil port serie (SPP), le meme pour toutes les imprimantes ESC/POS. */
    private val UUID_SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /**
     * Un appareil appaire est retenu comme imprimante si son nom le dit.
     * « 4G_Printer » sur le BROLEO, « IposPrinter » sur d'autres chassis.
     */
    private val NOM_IMPRIMANTE = Regex("print|imprim|pos", RegexOption.IGNORE_CASE)

    /** 58 mm = 384 points = 48 octets par ligne de trame. */
    private const val LARGEUR_MAX_PIXELS = 384

    /** Au-dela de ce seuil de luminosite, le point est laisse blanc. */
    private const val SEUIL_NOIR = 128
  }

  private var liaison: BluetoothSocket? = null

  private val adaptateur: BluetoothAdapter?
    get() = BluetoothAdapter.getDefaultAdapter()

  override fun definition() = ModuleDefinition {
    Name("BluetoothPrinter")

    /**
     * Ce terminal a-t-il une imprimante Bluetooth appairee ?
     *
     * On ecarte les Sunmi : leur imprimante est interne et pilotee par leur
     * propre SDK. Si un vendeur y appairait une imprimante externe, la
     * detection la prendrait pour l'imprimante du terminal et les fiches
     * sortiraient au mauvais endroit.
     */
    AsyncFunction("estDisponible") {
      if (Build.MANUFACTURER.contains("SUNMI", ignoreCase = true)) {
        return@AsyncFunction false
      }

      try {
        imprimanteAppairee() != null
      } catch (e: Exception) {
        // Bluetooth eteint ou permission refusee : ce n'est pas ce pilote-la.
        false
      }
    }

    /** Nom de l'imprimante trouvee, pour le diagnostic. */
    AsyncFunction("nomImprimante") {
      try {
        imprimanteAppairee()?.name
      } catch (e: Exception) {
        null
      }
    }

    AsyncFunction("connecter") { lier() }

    /** Ferme la liaison : le terminal ne tolere pas toujours deux connexions. */
    AsyncFunction("fermer") {
      try {
        liaison?.close()
      } catch (e: Exception) {
        // Deja fermee ou terminal debranche : rien a sauver.
      }
      liaison = null
    }

    /** Ecrit des octets bruts (commandes ESC/POS deja composees). */
    AsyncFunction("envoyer") { base64: String ->
      val octets = Base64.decode(base64, Base64.DEFAULT)
      val sortie = socket().outputStream

      try {
        sortie.write(octets)
        sortie.flush()
      } catch (e: Exception) {
        // Liaison coupee en cours de fiche : on l'oublie pour que la prochaine
        // impression reparte sur une connexion neuve au lieu d'echouer en
        // boucle sur un tuyau mort.
        liaison = null
        throw CodedException("ECRITURE_IMPOSSIBLE", "La liaison avec l'imprimante a ete coupee (${e.message}).", e)
      }
    }

    /**
     * Convertit une image en commande de trame ESC/POS, SANS l'envoyer.
     *
     * Le TypeScript l'ajoute a sa file comme n'importe quelle autre commande :
     * si on ecrivait l'image directement ici, elle doublerait le texte en
     * attente et sortirait au mauvais endroit de la fiche.
     */
    AsyncFunction("trameImage") { base64: String ->
      val octets = Base64.decode(base64, Base64.DEFAULT)
      val source = BitmapFactory.decodeByteArray(octets, 0, octets.size)
        ?: throw CodedException("IMAGE_ILLISIBLE", "Image illisible : base64 invalide ou format non supporte.", null)

      Base64.encodeToString(trameEscPos(source), Base64.NO_WRAP)
    }
  }

  /** Le premier appareil appaire dont le nom annonce une imprimante. */
  private fun imprimanteAppairee(): BluetoothDevice? {
    val adaptateur = this.adaptateur ?: return null
    if (!adaptateur.isEnabled) return null

    return adaptateur.bondedDevices?.firstOrNull { appareil ->
      NOM_IMPRIMANTE.containsMatchIn(appareil.name ?: "")
    }
  }

  private fun lier() {
    if (liaison?.isConnected == true) return

    val adaptateur = this.adaptateur
      ?: throw CodedException("BLUETOOTH_ABSENT", "Ce terminal n'a pas de Bluetooth.", null)

    if (!adaptateur.isEnabled) {
      throw CodedException("BLUETOOTH_ETEINT", "Le Bluetooth est eteint : allume-le pour imprimer.", null)
    }

    val appareil = imprimanteAppairee()
      ?: throw CodedException(
        "IMPRIMANTE_NON_APPAIREE",
        "Aucune imprimante appairee sur ce terminal. Appaire-la dans les reglages Bluetooth, puis reessaie.",
        null,
      )

    // La recherche d'appareils sature la radio et fait echouer la connexion.
    try {
      adaptateur.cancelDiscovery()
    } catch (e: Exception) {
      // Permission manquante : la connexion peut encore reussir.
    }

    liaison = try {
      appareil.createRfcommSocketToServiceRecord(UUID_SPP).apply { connect() }
    } catch (premier: Exception) {
      // Secours classique sur ces modules bon marche : leur table de services
      // est parfois vide, et seule l'ouverture directe du canal 1 fonctionne.
      try {
        val methode = appareil.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        (methode.invoke(appareil, 1) as BluetoothSocket).apply { connect() }
      } catch (second: Exception) {
        throw CodedException(
          "CONNEXION_IMPOSSIBLE",
          "Impossible de se connecter a l'imprimante ${appareil.name} (${premier.message}).",
          premier,
        )
      }
    }
  }

  private fun socket(): BluetoothSocket {
    lier()

    return liaison ?: throw CodedException("IMPRIMANTE_INDISPONIBLE", "L'imprimante Bluetooth n'est pas disponible.", null)
  }

  /**
   * L'image en commande GS v 0 : « GS v 0 m xL xH yL yH » suivi de la trame.
   *
   * La largeur est donnee en OCTETS, la hauteur en points. Chaque bit vaut un
   * point, le bit de poids fort a gauche, 1 pour noir.
   */
  private fun trameEscPos(source: Bitmap): ByteArray {
    // La transparence d'un PNG se lit noire : sans fond blanc, un logo a fond
    // transparent sortirait en rectangle plein.
    val image = surFondBlanc(source)

    val largeur = minOf(image.width, LARGEUR_MAX_PIXELS)
    val hauteur = image.height
    val octetsParLigne = (largeur + 7) / 8

    val entete = byteArrayOf(
      0x1D, 0x76, 0x30, 0x00,
      (octetsParLigne and 0xFF).toByte(), ((octetsParLigne shr 8) and 0xFF).toByte(),
      (hauteur and 0xFF).toByte(), ((hauteur shr 8) and 0xFF).toByte(),
    )

    val trame = ByteArray(octetsParLigne * hauteur)

    for (y in 0 until hauteur) {
      for (x in 0 until largeur) {
        val pixel = image.getPixel(x, y)
        // Luminosite perceptuelle : un aplat rouge vif doit sortir fonce, pas
        // blanc comme le donnerait une simple moyenne.
        val luminosite = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000

        if (luminosite < SEUIL_NOIR) {
          val index = y * octetsParLigne + (x / 8)
          trame[index] = (trame[index].toInt() or (0x80 shr (x % 8))).toByte()
        }
      }
    }

    return entete + trame
  }

  private fun surFondBlanc(source: Bitmap): Bitmap {
    if (source.width <= 0 || source.height <= 0) return source

    val aplati = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)

    Canvas(aplati).apply {
      drawColor(Color.WHITE)
      drawBitmap(source, 0f, 0f, null)
    }

    return aplati
  }
}
