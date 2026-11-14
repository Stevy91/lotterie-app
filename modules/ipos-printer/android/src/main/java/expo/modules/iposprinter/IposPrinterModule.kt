package expo.modules.iposprinter

import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.os.IBinder
import android.util.Base64
import com.iposprinter.iposprinterservice.IPosPrinterCallback
import com.iposprinter.iposprinterservice.IPosPrinterService
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Impression sur les terminaux a SDK iPos (Zhaohe Q1/Q2...).
 *
 * Le terminal expose son imprimante par un service Android. Contrairement au
 * SENRAISE, qui se lie par composant explicite, celui-ci se lie par paquet +
 * action, comme l'impose le fabricant.
 *
 * Deux differences de fond avec le SENRAISE, qui expliquent la forme du code :
 *
 * 1. Chaque methode prend un callback. On passe un callback muet : les
 *    fonctions sont deja asynchrones cote JavaScript et une fiche qui attend
 *    l'acquittement de chacune de ses trente lignes serait inutilement lente.
 *
 * 2. Rien ne sort tant que printerPerformPrint n'a pas ete appele. Le service
 *    accumule, puis imprime d'un bloc. C'est exactement le role de
 *    debuter()/terminer() : printerInit au debut, printerPerformPrint a la fin.
 */
class IposPrinterModule : Module() {

  companion object {
    private const val PAQUET_SERVICE = "com.iposprinter.iposprinterservice"

    // Le paquet dit "iposprinterservice" mais l'action dit "IPosPrintService",
    // sans le "er". C'est l'orthographe du fabricant : la corriger casse la
    // liaison.
    private const val ACTION_SERVICE = "com.iposprinter.iposprinterservice.IPosPrintService"

    private const val DELAI_LIAISON_SECONDES = 5L

    /** Les seules tailles acceptees par le service. */
    private val TAILLES_SUPPORTEES = intArrayOf(16, 24, 32, 48)

    /** Hauteur d'une ligne vide, en pixels : une ligne de texte a la taille par defaut. */
    private const val HAUTEUR_LIGNE_PIXELS = 24

    /**
     * Avance finale, en lignes de pixels, pour degager la fiche de la barre de
     * dechirure. Le terminal est portable : il n'a pas de massicot.
     */
    private const val AVANCE_FINALE_PIXELS = 120

    /** Decoupage du raster par le service ; 10 est la valeur par defaut du fabricant. */
    private const val DECOUPAGE_IMAGE = 10

    // ESC E n : emphase de la norme ESC/POS. Le SDK iPos n'expose aucune
    // methode "gras" ; on passe donc par sa porte ESC/POS. Si le service rend
    // le texte en bitmap, l'emphase restera sans effet : la fiche sort alors
    // correcte, simplement sans gras. Jamais de quoi empecher une vente.
    private val GRAS_ACTIF = byteArrayOf(0x1B, 0x45, 0x01)
    private val GRAS_INACTIF = byteArrayOf(0x1B, 0x45, 0x00)
  }

  private var imprimante: IPosPrinterService? = null
  private var liaisonEnCours: CountDownLatch? = null

  private val contexte: Context
    get() = requireNotNull(appContext.reactContext) { "Contexte Android indisponible." }

  /** Le service exige un callback non nul ; on n'a rien a en faire. */
  private val rappelMuet = object : IPosPrinterCallback.Stub() {
    override fun onRunResult(isSuccess: Boolean) {}
    override fun onReturnString(result: String?) {}
  }

  private val connexion = object : ServiceConnection {
    override fun onServiceConnected(nom: ComponentName?, binder: IBinder?) {
      imprimante = IPosPrinterService.Stub.asInterface(binder)
      liaisonEnCours?.countDown()
    }

    override fun onServiceDisconnected(nom: ComponentName?) {
      // Service tue (mise a jour, memoire) : on oublie la reference pour forcer
      // une nouvelle liaison, plutot que de laisser un binder mort provoquer
      // une erreur illisible au milieu d'une fiche.
      imprimante = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("IposPrinter")

    /**
     * Le terminal embarque-t-il le service iPos ?
     * Simple recherche de paquet : aucun effet de bord, aucun delai impose aux
     * terminaux d'une autre marque.
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

    /** Etat de l'imprimante : 0 normale, 1 sans papier, 2 et 3 surchauffe, 4 occupee, 5 erreur. */
    AsyncFunction("statut") { service().printerStatus }

    AsyncFunction("debuter") { service().printerInit(rappelMuet) }

    /** Sans cet appel, rien n'est imprime : le service se contente d'accumuler. */
    AsyncFunction("terminer") { service().printerPerformPrint(AVANCE_FINALE_PIXELS, rappelMuet) }

    AsyncFunction("texte") { contenu: String -> service().printText(contenu, rappelMuet) }

    /** 0 = gauche, 1 = centre, 2 = droite. */
    AsyncFunction("alignement") { valeur: Int ->
      service().setPrinterPrintAlignment(valeur, rappelMuet)
    }

    AsyncFunction("taille") { taille: Int ->
      service().setPrinterPrintFontSize(tailleSupportee(taille), rappelMuet)
    }

    AsyncFunction("gras") { actif: Boolean ->
      service().sendUserCMDData(if (actif) GRAS_ACTIF else GRAS_INACTIF, rappelMuet)
    }

    AsyncFunction("sauterLignes") { nombre: Int ->
      // Le fabricant deconseille printerFeedLines entre deux blocs de texte :
      // le moteur tourne a vide et le rendu saute. printBlankLines envoie de
      // vrais octets vides, ce qui conserve l'alignement vertical.
      service().printBlankLines(nombre.coerceIn(1, 100), HAUTEUR_LIGNE_PIXELS, rappelMuet)
    }

    /**
     * Colonnes : une largeur et un alignement par colonne, en caracteres.
     * Le dernier argument 0 indique que la ligne n'enchaine pas sur un tableau
     * en cours : chaque ligne de la fiche est autonome.
     */
    AsyncFunction("colonnes") { textes: List<String>, largeurs: List<Int>, alignements: List<Int> ->
      service().printColumnsText(
        textes.toTypedArray(),
        largeurs.toIntArray(),
        alignements.toIntArray(),
        0,
        rappelMuet,
      )
    }

    AsyncFunction("qrCode") { donnees: String, taille: Int, correction: Int ->
      service().printQRCode(donnees, taille.coerceIn(1, 16), correction.coerceIn(0, 3), rappelMuet)
    }

    /** Logo du client, transmis en base64 depuis le JavaScript, deja redimensionne. */
    AsyncFunction("image") { base64: String, alignement: Int ->
      val octets = Base64.decode(base64, Base64.DEFAULT)
      val image: Bitmap = BitmapFactory.decodeByteArray(octets, 0, octets.size)
        ?: throw CodedException("IMAGE_ILLISIBLE", "Image illisible : base64 invalide ou format non supporte.", null)

      service().printBitmap(alignement, DECOUPAGE_IMAGE, surFondBlanc(image), rappelMuet)
    }
  }

  /** La taille demandee, ramenee a la plus proche que le service accepte. */
  private fun tailleSupportee(taille: Int): Int =
    TAILLES_SUPPORTEES.minByOrNull { kotlin.math.abs(it - taille) } ?: 24

  /**
   * L'image posee sur un fond blanc, sans couche de transparence.
   *
   * Le logo arrive en PNG, qui conserve la transparence. Le service convertit
   * en noir et blanc d'apres la seule couleur des pixels, sans regarder leur
   * opacite : un fond transparent, dont la couleur est noire, ressortait en
   * rectangle noir plein a la place du logo.
   */
  private fun surFondBlanc(source: Bitmap): Bitmap {
    if (source.width <= 0 || source.height <= 0) {
      return source
    }

    val aplati = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)

    Canvas(aplati).apply {
      drawColor(Color.WHITE)
      drawBitmap(source, 0f, 0f, null)
    }

    return aplati
  }

  /**
   * Liaison au service, au plus une fois. Bloque le temps que le systeme
   * etablisse la connexion : toutes les fonctions sont des AsyncFunction, donc
   * l'attente a lieu hors du fil principal.
   */
  private fun lier() {
    if (imprimante != null) return

    val intention = Intent().apply {
      setPackage(PAQUET_SERVICE)
      action = ACTION_SERVICE
    }
    val attente = CountDownLatch(1)
    liaisonEnCours = attente

    val demande = try {
      contexte.bindService(intention, connexion, Context.BIND_AUTO_CREATE)
    } catch (e: Exception) {
      throw CodedException(
        "SERVICE_INTROUVABLE",
        "Le service d'impression iPos est introuvable sur ce terminal (${e.message}).",
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
        "Le service d'impression iPos n'a pas repondu en $DELAI_LIAISON_SECONDES secondes.",
        null,
      )
    }
  }

  /** L'imprimante, en se liant au service si ce n'est pas deja fait. */
  private fun service(): IPosPrinterService {
    lier()

    return imprimante ?: throw CodedException(
      "IMPRIMANTE_INDISPONIBLE",
      "L'imprimante iPos n'est pas disponible.",
      null,
    )
  }
}
