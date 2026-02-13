import React, { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TextInput, 
  TouchableOpacity, ActivityIndicator, SafeAreaView, Modal 
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../src/constants/theme';

export default function Clientes() {
  const router = useRouter();
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => { fetchClientes(); }, []);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('clientes').select('*');
      if (error) throw error;
      setClientes(data || []);
    } catch (error) { console.error(error.message); }
    finally { setLoading(false); }
  };

  const renderCliente = ({ item }) => (
    <TouchableOpacity 
      style={[styles.card, GLOBAL_STYLES.shadow]} 
      onPress={() => setSelectedClient(item)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardCode}>{item.CardCode}</Text>
        <Text style={styles.cardName}>{item.CardName}</Text>
      </View>
      <View style={styles.balanceContainer}>
        <Text style={styles.balanceLabel}>Saldo SAP</Text>
        <Text style={styles.balanceValue}>${parseFloat(item.Balance).toLocaleString()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Seleccionar Cliente',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white
      }} />

      <View style={styles.header}>
        <TextInput 
          style={GLOBAL_STYLES.input} 
          placeholder="Buscar por nombre o código..." 
          placeholderTextColor={COLORS.textLight}
          onChangeText={setSearch} 
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList 
          data={clientes.filter(c => 
            c.CardName.toLowerCase().includes(search.toLowerCase()) || 
            c.CardCode.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={item => item.CardCode}
          renderItem={renderCliente}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* Modal Ficha de Cliente */}
      <Modal visible={!!selectedClient} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ficha del Socio</Text>
            
            <View style={styles.infoBox}>
               <DetailRow label="Código" value={selectedClient?.CardCode} />
               <DetailRow label="Razón Social" value={selectedClient?.CardName} />
               <DetailRow label="Condición" value={selectedClient?.PyMntGroup} />
               <DetailRow label="Lista" value={`N° ${selectedClient?.ListNum}`} />
               <DetailRow 
                label="Saldo Pendiente" 
                value={`$${selectedClient?.Balance}`} 
                isDanger={selectedClient?.Balance > 0} 
               />
            </View>

            <TouchableOpacity 
              style={GLOBAL_STYLES.buttonSecondary} 
              onPress={() => {
                const c = selectedClient; setSelectedClient(null);
                router.push({ pathname: '/catalogo', params: { cardCode: c.CardCode, listNum: c.ListNum } });
              }}
            >
              <Text style={styles.btnText}>INICIAR PEDIDO</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSelectedClient(null)} style={styles.btnClose}>
              <Text style={{ color: COLORS.textLight }}>Regresar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Componente pequeño para las filas del modal
const DetailRow = ({ label, value, isDanger }) => (
  <View style={styles.detailRow}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, isDanger && { color: COLORS.secondary }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 15, backgroundColor: COLORS.primary },
  card: { 
    backgroundColor: COLORS.white, 
    padding: 18, 
    marginHorizontal: 12, 
    marginTop: 12, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  cardCode: { fontSize: 11, color: COLORS.secondary, fontWeight: 'bold', marginBottom: 2 },
  cardName: { fontSize: 15, color: COLORS.primary, fontWeight: 'bold' },
  balanceContainer: { alignItems: 'flex-end' },
  balanceLabel: { fontSize: 10, color: COLORS.textLight },
  balanceValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: COLORS.white, borderRadius: 20, padding: 25 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  infoBox: { marginBottom: 25 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { color: COLORS.textLight, fontSize: 14 },
  value: { fontWeight: 'bold', color: COLORS.text, fontSize: 14 },
  btnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  btnClose: { marginTop: 20, alignItems: 'center' }
});