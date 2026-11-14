/**
 * Service d'impression iPos (Zhaohe Q1/Q2, et les terminaux qui reprennent ce
 * SDK). Copie conforme du fichier du fabricant (AIDL Version 1.0.0), verifiee
 * sur deux sources independantes : la demo officielle du fabricant et le
 * plugin Cordova paystory-de/cordova-plugin-iposprinter. Les deux declarent
 * exactement les memes methodes dans le meme ordre.
 *
 * NE PAS MODIFIER L'ORDRE DES METHODES, ni leurs signatures.
 * L'ordre de declaration fixe les identifiants de transaction du binder :
 * deplacer une methode, ou en omettre une, fait tomber silencieusement tous
 * les appels suivants sur la mauvaise fonction du service.
 *
 * Piege a eviter : la documentation PDF du vendeur numerote les fonctions
 * dans un ordre DIFFERENT de ce fichier (elle place printerInit avant
 * getPrinterStatus) et omet completement PrintSpecFormatText, qui se trouve
 * pourtant au milieu de la liste. Suivre le PDF decalerait tout ce qui suit.
 * Ce fichier, et non le PDF, fait foi.
 *
 * PrintSpecFormatText garde sa majuscule initiale et l'absence de marqueur
 * "in" sur son callback : c'est ainsi chez le fabricant.
 */

package com.iposprinter.iposprinterservice;

import com.iposprinter.iposprinterservice.IPosPrinterCallback;
import android.graphics.Bitmap;

interface IPosPrinterService {

    /**
     * Etat courant de l'imprimante.
     * 0 PRINTER_NORMAL, 1 PRINTER_PAPERLESS, 2 PRINTER_THP_HIGH_TEMPERATURE,
     * 3 PRINTER_MOTOR_HIGH_TEMPERATURE, 4 PRINTER_IS_BUSY, 5 PRINTER_ERROR_UNKNOWN.
     */
    int getPrinterStatus();

    /** Mise sous tension et reglages par defaut. */
    void printerInit(in IPosPrinterCallback callback);

    /** Noirceur d'impression, de 1 a 10 (defaut 6). */
    void setPrinterPrintDepth(int depth, in IPosPrinterCallback callback);

    /** Police ; seule "ST" est supportee par le service. */
    void setPrinterPrintFontType(String typeface, in IPosPrinterCallback callback);

    /** Taille : 16, 24, 32 ou 48 uniquement. Toute autre valeur retombe sur 24. */
    void setPrinterPrintFontSize(int fontsize, in IPosPrinterCallback callback);

    /** 0 gauche, 1 centre, 2 droite. */
    void setPrinterPrintAlignment(int alignment, in IPosPrinterCallback callback);

    /** Avance du papier, en lignes de pixels, moteur a vide. */
    void printerFeedLines(int lines, in IPosPrinterCallback callback);

    /** Lignes blanches (100 au plus), hauteur en pixels. Preferable a printerFeedLines. */
    void printBlankLines(int lines, int height, in IPosPrinterCallback callback);

    /** Texte ; le retour a la ligne est automatique en fin de ligne. */
    void printText(String text, in IPosPrinterCallback callback);

    /** Texte avec police et taille valables pour ce seul appel. */
    void printSpecifiedTypeText(String text, String typeface, int fontsize, in IPosPrinterCallback callback);

    /** Idem, avec l'alignement en plus. */
    void PrintSpecFormatText(String text, String typeface, int fontsize, int alignment, IPosPrinterCallback callback);

    /**
     * Une ligne de tableau. La somme des largeurs ne doit pas depasser
     * ((384 / fontsize) << 1) - (nombre de colonnes + 1).
     * isContinuousPrint : 1 pour enchainer le tableau, 0 sinon.
     */
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, int isContinuousPrint, in IPosPrinterCallback callback);

    /** Image, 384 pixels de large au maximum. bitmapSize de 1 a 16 (defaut 10). */
    void printBitmap(int alignment, int bitmapSize, in Bitmap mBitmap, in IPosPrinterCallback callback);

    /** Code-barres : symbology 0 a 8, hauteur et largeur de 1 a 16. */
    void printBarCode(String data, int symbology, int height, int width, int textposition, in IPosPrinterCallback callback);

    /** QR code : modulesize de 1 a 16, correction 0 L, 1 M, 2 Q, 3 H. */
    void printQRCode(String data, int modulesize, int mErrorCorrectionLevel, in IPosPrinterCallback callback);

    /** Donnees brutes. */
    void printRawData(in byte[] rawPrintData, in IPosPrinterCallback callback);

    /** Commandes ESC/POS. */
    void sendUserCMDData(in byte[] data, in IPosPrinterCallback callback);

    /**
     * Declenche reellement l'impression de tout ce qui precede, puis avance
     * de feedlines lignes de pixels. Sans cet appel, rien ne sort.
     * N'a d'effet que si l'imprimante est en PRINTER_NORMAL.
     */
    void printerPerformPrint(int feedlines, in IPosPrinterCallback callback);
}
