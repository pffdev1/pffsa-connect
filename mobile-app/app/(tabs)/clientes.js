import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, SafeAreaView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabaseClient'; // Ruta ajustada por estar en (tabs)
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      setLoading(false);
      // Simulación de datos o fetch real de Supabase
      const { data, error } = await supabase.from('clientes').select('*');
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* --- AQUÍ SE COLOCA EL BLOQUE --- */}
      <Stack.Screen options={{ 
        title: 'Directorio de Clientes',
        headerRight: () => (
          <TouchableOpacity 
            style={{ marginRight: 15 }} 
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/');
            }}
          >
            <Ionicons name="log-out-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        )
      }} />
      {/* -------------------------------- */}

      <View style={styles.searchContainer}>
        <TextInput 
          style={GLOBAL_STYLES.input}
          placeholder="Buscar por nombre o RUC..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={clientes.filter(c => c.CardName.toLowerCase().includes(search.toLowerCase()))}
          keyExtractor={(item) => item.CardCode}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.card, GLOBAL_STYLES.shadow]}
              onPress={() => router.push({
                pathname: '/catalogo',
                params: { cardCode: item.CardCode, listNum: item.ListNum }
              })}
            >
              <Text style={styles.cardCode}>{item.CardCode}</Text>
              <Text style={styles.cardName}>{item.CardName}</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchContainer: { padding: 15, backgroundColor: COLORS.primary },
  card: {
    backgroundColor: '#FFF',
    padding: 15,
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardCode: { fontSize: 12, color: COLORS.secondary, fontWeight: 'bold' },
  cardName: { fontSize: 16, flex: 1, marginLeft: 10, color: COLORS.text }
});