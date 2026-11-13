package expo.modules.senraiseprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.IBinder
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import recieptservice.com.recieptservice.PrinterInterface
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Impression sur les terminaux SENRAISE (H10S...).
 *
 * Le terminal expose son imprimante par un service Android, auquel on se lie
 * par composant explicite. Aucun SDK binaire n'est necessaire : l'interface
 * AIDL suffit (voir PrinterInterface.aidl).
 *
 * Le service appartient au paquet "recieptservice.com.recieptservice" --
 * orthographe du fabricant, "reciept" et non "receipt". La corriger casserait
 * la liaison.
 */
class SenraisePrinterModule : Module() {

  companion object {
    private const val PAQUET_SERVICE = "recieptservice.com.recieptservice"
    private const val CLASSE_SERVICE = "recieptservice.com.recieptservice.service.PrinterService"

    /** Au-dela, on considere que le service ne repondra pas. */
    private const val DELAI_LIAISON_SECONDES = 5L
  }

  private var imprimante: PrinterInterface? = null
  private var liaisonEnCours: CountDownLatch? = null

  private val contexte: Context
    get() = requireNotNull(appContext.reactContext) { "Contexte Android indisponible." }

  private val connexion = object : ServiceConnection {
    override fun onServiceConnected(nom: ComponentName?, binder: IBinder?) {
      imprimante = PrinterInterface.Stub.asInterface(binder)
      liaisonEnCours?.countDown()
    }

    override fun onServiceDisconnected(nom: ComponentName?) {
      // Le service a ete tue (mise a jour, memoire) : on oublie la reference
      // pour forcer une nouvelle liaison au prochain appel, plutot que de
      // laisser un binder mort provoquer une erreur illisible.
      imprimante = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SenraisePrinter")

    /**
     * Le terminal est-il un SENRAISE avec son service d'impression ?
     * Ne se lie a rien : sert a choisir le pilote au demarrage, sans effet
     * de bord ni delai sur un appareil d'une autre marque.
     */
    AsyncFunction("estDisponible") {
      try {
        contexte.packageManager.getPackageInfo(PAQUET_SERVICE, 0)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("connecter") { lier() }

    /** Version du service, utile pour diagnostiquer un terminal recalcitrant. */
    AsyncFunction("version") { service().serviceVersion ?: "" }

    /**
     * Les impressions sont encadrees par beginWork/endWork : le service
     * accumule puis envoie d'un bloc. Sans cet encadrement, une fiche longue
     * sort par morceaux entrecoupes de blancs.
     */
    AsyncFunction("debuter") { service().beginWork() }
    AsyncFunction("terminer") { service().endWork() }

    AsyncFunction("texte") { contenu: String -> service().printText(contenu) }

    /** 0 = gauche, 1 = centre, 2 = droite. */
    AsyncFunction("alignement") { valeur: Int -> service().setAlignment(valeur) }

    AsyncFunction("taille") { taille: Float -> service().setTextSize(taille) }
    AsyncFunction("gras") { actif: Boolean -> service().setTextBold(actif) }
    AsyncFunction("sauterLignes") { nombre: Int -> service().nextLine(nombre) }

    /**
     * Colonnes : un poids et un alignement par colonne. Le service repartit
     * la largeur du papier selon les poids.
     */
    AsyncFunction("colonnes") { textes: List<String>, poids: List<Int>, alignements: List<Int> ->
      service().printTableText(
        textes.toTypedArray(),
        poids.toIntArray(),
        alignements.toIntArray(),
      )
    }

    AsyncFunction("qrCode") { donnees: String, taille: Int, correction: Int ->
      service().printQRCode(donnees, taille, correction)
    }

    /** Logo du client, transmis en base64 depuis le JavaScript. */
    AsyncFunction("image") { base64: String ->
      val octets = Base64.decode(base64, Base64.DEFAULT)
      val image: Bitmap = BitmapFactory.decodeByteArray(octets, 0, octets.size)
        ?: throw CodedException("IMAGE_ILLISIBLE", "Image illisible : base64 invalide ou format non supporte.", null)

      service().printBitmap(image)
    }
  }

  /**
   * Liaison au service, au plus une fois. Bloque le temps que le systeme
   * etablisse la connexion : les fonctions sont declarees AsyncFunction, donc
   * l'attente a lieu hors du fil principal.
   */
  private fun lier() {
    if (imprimante != null) return

    val intention = Intent().apply { setClassName(PAQUET_SERVICE, CLASSE_SERVICE) }
    val attente = CountDownLatch(1)
    liaisonEnCours = attente

    val demande = try {
      contexte.startService(intention)
      contexte.bindService(intention, connexion, Context.BIND_AUTO_CREATE)
    } catch (e: Exception) {
      throw CodedException(
        "SERVICE_INTROUVABLE",
        "Le service d'impression SENRAISE est introuvable sur ce terminal (${e.message}).",
        e,
      )
    }

    if (!demande) {
      throw CodedException(
        "LIAISON_REFUSEE",
        "Le terminal a refuse la liaison au service d'impression ($PAQUET_SERVICE).",
        null,
      )
    }

    if (!attente.await(DELAI_LIAISON_SECONDES, TimeUnit.SECONDS) || imprimante == null) {
      throw CodedException(
        "SERVICE_MUET",
        "Le service d'impression SENRAISE n'a pas repondu en $DELAI_LIAISON_SECONDES secondes.",
        null,
      )
    }
  }

  /** L'imprimante, en se liant au service si ce n'est pas deja fait. */
  private fun service(): PrinterInterface {
    lier()

    return imprimante ?: throw CodedException(
      "IMPRIMANTE_INDISPONIBLE",
      "L'imprimante SENRAISE n'est pas disponible.",
      null,
    )
  }
}
