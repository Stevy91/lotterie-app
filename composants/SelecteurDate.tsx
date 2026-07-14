import { useState } from 'react';
import { Platform, StyleProp, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Props {
  date: Date;
  onChangerDate: (date: Date) => void;
  style?: StyleProp<ViewStyle>;
  texteStyle?: StyleProp<TextStyle>;
}

function formaterDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function versDateInputWeb(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Sur le web, @react-native-community/datetimepicker ne s'affiche pas de facon fiable
// dans un navigateur : on utilise directement le selecteur de date natif du navigateur.
export default function SelecteurDate({ date, onChangerDate, style, texteStyle }: Props) {
  const [calendrierVisible, setCalendrierVisible] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={style}>
        {/* @ts-ignore - element HTML natif, uniquement rendu sur le web */}
        <input
          type="date"
          value={versDateInputWeb(date)}
          onChange={(e: any) => {
            const [annee, mois, jour] = e.target.value.split('-').map(Number);
            if (annee && mois && jour) {
              onChangerDate(new Date(annee, mois - 1, jour));
            }
          }}
          style={{
            border: 'none',
            background: 'transparent',
            fontWeight: '600',
            fontSize: 13,
            color: '#333',
            textAlign: 'center',
            width: '100%',
          }}
        />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={style} onPress={() => setCalendrierVisible(true)}>
        <Text style={texteStyle}>{formaterDate(date)}</Text>
      </TouchableOpacity>
      {calendrierVisible && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={(_event, dateChoisie) => {
            setCalendrierVisible(false);
            if (dateChoisie) onChangerDate(dateChoisie);
          }}
        />
      )}
    </>
  );
}
