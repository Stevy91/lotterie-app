// Interface du service d'impression des terminaux SENRAISE (H10S...).
//
// ATTENTION : l'ORDRE des methodes est significatif. AIDL attribue les
// identifiants de transaction par ordre de declaration ; une methode
// deplacee ou inseree fait tomber tous les appels suivants sur la mauvaise
// fonction du service, sans aucune erreur visible.
//
// Cet ordre reproduit exactement celui du stub publie par le fabricant
// (TRANSACTION_printEpson = 0 ... TRANSACTION_getScannerStatus = 20).
//
// Les quatre dernieres methodes du service (checkPSAMCard, activatePSAMCard,
// deactivatePSAMCard, transmitPSAMCard, indices 21 a 24) sont volontairement
// OMISES : elles concernent le lecteur de carte PSAM, dont l'application n'a
// pas besoin, et elles exigeraient de declarer l'interface PSAMCallback.
// Les omettre est sans danger car elles viennent APRES tout ce qu'on utilise.
//
// Le nom du paquet et celui de l'interface doivent rester identiques :
// le service verifie le descripteur "recieptservice.com.recieptservice.PrinterInterface".
package recieptservice.com.recieptservice;

import android.graphics.Bitmap;

interface PrinterInterface {
    void printEpson(in byte[] data);                                        // 0
    String getServiceVersion();                                             // 1
    void printText(String text);                                            // 2
    void printBitmap(in Bitmap pic);                                        // 3
    void printBarCode(String data, int symbology, int height, int width);   // 4
    void printQRCode(String data, int modulesize, int errorlevel);          // 5
    void setAlignment(int alignment);                                       // 6
    void setTextSize(float textSize);                                       // 7
    void nextLine(int line);                                                // 8
    void printTableText(in String[] text, in int[] weight, in int[] alignment); // 9
    void setTextBold(boolean bold);                                         // 10
    void beginWork();                                                       // 11
    void endWork();                                                         // 12
    void setDark(int value);                                                // 13
    void setLineHeight(float lineHeight);                                   // 14
    void setTextDoubleWidth(boolean enable);                                // 15
    void setTextDoubleHeight(boolean enable);                               // 16
    void printPDF417Code(String data, int modulesize, int errorlevel);      // 17
    void setCode(String code);                                              // 18
    void print128BarCode(String data, int type, int height, int width);     // 19
    boolean getScannerStatus();                                             // 20
}
