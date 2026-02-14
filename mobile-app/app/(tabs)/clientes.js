import React, { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  TextInput, ActivityIndicator, SafeAreaView, Modal 
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null); // Para el Modal
  const router = useRouter();

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('clientes').select('*');
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCliente = ({ item }) => (
    <View style={[styles.card, GLOBAL_STYLES.shadow]}>
      {/* Zona de selección: Lleva al catálogo con Código y Nombre */}
      <TouchableOpacity 
        style={{ flex: 1 }}
        onPress={() => router.push({
          pathname: '/catalogo',
          params: { cardCode: item.CardCode, cardName: item.CardName }
        })}
      >
        <Text style={styles.cardCode}>{item.CardCode}</Text>
        <Text style={styles.cardName}>{item.CardName}</Text>
        <Text style={styles.cardRuc}>RUC: {item.LicTradNum || 'No disponible'}</Text>
      </TouchableOpacity>

      {/* Botón para ver detalles (Modal) */}
      <TouchableOpacity 
        style={styles.infoButton}
        onPress={() => setSelectedClient(item)}
      >
        <Ionicons name="information-circle-outline" size={26} color={COLORS.secondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
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

      {/* Buscador con Placeholder descriptivo */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.textLight} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Ej: Degourmet o C000123..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={clientes.filter(c => 
            c.CardName.toLowerCase().includes(search.toLowerCase()) || 
            c.CardCode.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={(item) => item.CardCode}
          renderItem={renderCliente}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No se encontraron clientes.</Text>
          }
        />
      )}

      {/* MODAL DE DETALLES DEL CLIENTE */}
      <Modal
        visible={!!selectedClient}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedClient(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ficha del Cliente</Text>
              <TouchableOpacity onPress={() => setSelectedClient(null)}>
                <Ionicons name="close" size={28} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {selectedClient && (
              <View style={styles.modalBody}>
                <DetailRow label="Código SAP" value={selectedClient.CardCode} />
                <DetailRow label="Nombre Fiscal" value={selectedClient.CardName} />
                <DetailRow label="RUC / ID" value={selectedClient.LicTradNum} />
                <DetailRow label="Lista de Precios" value={`Lista #${selectedClient.ListNum}`} />
                <DetailRow label="Saldo Actual" value={`$${parseFloat(selectedClient.Balance || 0).toFixed(2)}`} />
                <DetailRow label="Dirección" value={selectedClient.Address || 'Provincia, Ciudad, Calle...'} />
              </View>
            )}

            <TouchableOpacity 
              style={[GLOBAL_STYLES.buttonPrimary, { marginTop: 20 }]}
              onPress={() => {
                const client = selectedClient;
                setSelectedClient(null);
                router.push({
                  pathname: '/catalogo',
                  params: { cardCode: client.CardCode, cardName: client.CardName }
                });
              }}
            >
              <Text style={{color: '#FFF', fontWeight: 'bold'}}>INICIAR PEDIDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Componente pequeño para las filas del modal
const DetailRow = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}:</Text>
    <Text style={styles.detailValue}>{value || 'N/A'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchContainer: { padding: 15, backgroundColor: COLORS.primary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 45
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  card: {
    backgroundColor: '#FFF',
    padding: 15,
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCode: { fontSize: 11, color: COLORS.secondary, fontWeight: 'bold' },
  cardName: { fontSize: 16, color: COLORS.primary, fontWeight: 'bold', marginVertical: 2 },
  cardRuc: { fontSize: 12, color: COLORS.textLight },
  infoButton: { padding: 5, marginLeft: 10 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textLight },
  
  // Estilos del Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    elevation: 10
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 10
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  modalBody: { gap: 12 },
  detailRow: { flexDirection: 'column' },
  detailLabel: { fontSize: 12, color: COLORS.textLight, fontWeight: '600' },
  detailValue: { fontSize: 15, color: COLORS.text, fontWeight: '500' }
});