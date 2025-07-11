import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { db, getFirebaseAuth } from '../../firebaseConfig';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function PlatformFeeTransactionsScreen() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme() ?? 'light';
    const background = Colors[colorScheme].background;
    const card = Colors[colorScheme].surface;
    const text = Colors[colorScheme].text;
    const heading = Colors[colorScheme].secondary;
    const accent = Colors[colorScheme].primary;
    const error = colorScheme === 'light' ? '#dc2626' : '#f87171';

    useEffect(() => {
        const auth = getFirebaseAuth();
        if (!auth.currentUser?.uid) return;
        setLoading(true);
        const paymentsRef = collection(db, 'drivers', auth.currentUser.uid, 'commissionPayments');
        const q = query(paymentsRef, orderBy('paidAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txns = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    amount: data.amount ?? 0,
                    paymentId: data.paymentId ?? '',
                    status: data.status ?? 'unknown',
                    paidAt: data.paidAt,
                };
            });
            setTransactions(txns);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching platform fee transactions:', error);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.text, fontFamily: 'Poppins-Medium', marginBottom: 18 }}>
                Platform Fee Transactions
            </Text>
            {loading ? (
                <ActivityIndicator size="large" color={accent} />
            ) : transactions.length === 0 ? (
                <Text style={{ color: text, fontFamily: 'Poppins-Medium' }}>No transactions found.</Text>
            ) : (
                <ScrollView>
                    {transactions.map(txn => (
                        <View key={txn.id} style={styles.transactionCard}>
                            <Text style={[styles.amount, { color: accent, fontFamily: 'Poppins-Medium' }]}>Amount: ₹{txn.amount?.toFixed(2)}</Text>
                            <Text style={{ color: text, fontFamily: 'Poppins-Medium', fontSize: 13 }}>Date: {txn.paidAt?.toDate ? txn.paidAt.toDate().toLocaleString() : ''}</Text>
                            <Text style={{ color: text, fontFamily: 'Poppins-Medium', fontSize: 13 }}>Payment ID: {txn.paymentId}</Text>
                            <Text style={{ color: txn.status === 'success' ? 'green' : error, fontFamily: 'Poppins-Medium' }}>Status: {txn.status}</Text>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    transactionCard: {
        backgroundColor: Colors.light.card,
        borderRadius: 14,
        padding: 18,
        marginBottom: 14,
        shadowColor: Colors.light.primary,
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    amount: {
        fontWeight: 'bold',
        fontSize: 17,
        marginBottom: 4,
        fontFamily: 'Poppins-Medium',
    },
}); 