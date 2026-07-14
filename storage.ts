import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store ne fonctionne que sur iOS/Android : sur web on retombe sur localStorage.
export async function setItem(cle: string, valeur: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(cle, valeur);
    return;
  }
  await SecureStore.setItemAsync(cle, valeur);
}

export async function getItem(cle: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(cle);
  }
  return SecureStore.getItemAsync(cle);
}

export async function removeItem(cle: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(cle);
    return;
  }
  await SecureStore.deleteItemAsync(cle);
}
