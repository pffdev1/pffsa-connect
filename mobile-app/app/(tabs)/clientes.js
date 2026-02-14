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
  const [selectedClient, setSelectedClient] = useState(null);
  const router = useRouter();

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      // Consulta a la tabla customers poblada desde n8n
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('CardName', { ascending: true });
        
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error("Error cargando clientes:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de filtrado multicampo (Nombre, Comercial, Código y RUC)
  const clientesFiltrados = clientes.filter(c => {
    const s = search.toLowerCase();
    const nombreLegal = (c.CardName || "").toLowerCase();
    const nombreComercial = (c.CardFName || "").toLowerCase();
    const codigo = (c.CardCode || "").toLowerCase();
    const ruc = (c.RUC || "").toLowerCase();

    return nombreLegal.includes(s) || 
           nombreComercial.includes(s) || 
           codigo.includes(s) || 
           ruc.includes(s);
  });

  const renderCliente = ({ item }) => (
    <View style={[styles.card, GLOBAL_STYLES.shadow]}>
      <TouchableOpacity 
        style={{ flex: 1 }}
        onPress={() => router.push({
          pathname: '/catalogo',
          params: { 
            cardCode: item.CardCode, 
            cardName: item.CardFName || item.CardName 
          }
        })}
      >
        <Text style={styles.cardCode}>{item.CardCode}</Text>
        <Text style={styles.cardName}>{item.CardFName || item.CardName}</Text>
        <Text style={styles.cardRuc}>RUC: {item.RUC} (DV {item.DV})</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.infoButton}
        onPress={() => setSelectedClient(item)}
      >
        <Ionicons name="information-circle-outline" size={28} color={COLORS.secondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Directorio de Clientes' }} />

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.textLight} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Buscar por nombre, RUC o código..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 10, color: COLORS.textLight }}>Sincronizando con SAP...</Text>
        </View>
      ) : (
        <FlatList
          data={clientesFiltrados}
          keyExtractor={(item) => item.CardCode}
          renderItem={renderCliente}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No se encontraron clientes para "{search}"</Text>
          }
        />
      )}

      {/* MODAL DE DETALLES */}
      <Modal visible={!!selectedClient} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ficha del Cliente</Text>
              <TouchableOpacity onPress={() => setSelectedClient(null)}>
                <Ionicons name="close-circle" size={32} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {selectedClient && (
              <View style={styles.modalBody}>
                <DetailRow label="Razón Social" value={selectedClient.CardName} />
                <DetailRow label="Nombre Comercial" value={selectedClient.CardFName} />
                <DetailRow label="RUC / DV" value={`${selectedClient.RUC} - ${selectedClient.DV}`} />
                <DetailRow label="Vendedor" value={selectedClient.Vendedor} />
                <DetailRow label="Ruta / Zona" value={`${selectedClient.Ruta} (${selectedClient.Zona})`} />
                <DetailRow 
                  label="Balance Actual" 
                  value={`$${parseFloat(selectedClient.Balance).toFixed(2)}`} 
                  color={parseFloat(selectedClient.Balance) > 0 ? '#E74C3C' : '#27AE60'} 
                />
                <DetailRow label="Dirección de Entrega" value={selectedClient.Direccion} />
                <DetailRow label="Horario de Atención" value={selectedClient.Horario} />
              </View>
            )}

            <TouchableOpacity 
              style={[GLOBAL_STYLES.buttonPrimary, { marginTop: 25 }]}
              onPress={() => {
                const c = selectedClient;
                setSelectedClient(null);
                router.push({ 
                  pathname: '/catalogo', 
                  params: { cardCode: c.CardCode, cardName: c.CardFName || c.CardName } 
                });
              }}
            >
              <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>LEVANTAR PEDIDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Componente auxiliar para filas de detalle
const DetailRow = ({ label, value, color = COLORS.text }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, { color }]}>{value || 'No disponible'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { padding: 15, backgroundColor: COLORS.primary },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: COLORS.text },
  card: { backgroundColor: '#FFF', padding: 15, marginHorizontal: 15, marginTop: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  cardCode: { fontSize: 11, color: COLORS.secondary, fontWeight: 'bold', marginBottom: 2 },
  cardName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  cardRuc: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  infoButton: { padding: 5, marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  modalBody: { gap: 12 },
  detailRow: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 6 },
  detailLabel: { fontSize: 10, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 30, color: COLORS.textLight, fontSize: 15 }
});