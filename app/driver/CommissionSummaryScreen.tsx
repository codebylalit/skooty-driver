import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import RazorpayCheckout from 'react-native-razorpay';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { getCommissionSummary, markCommissionPaid, addCommissionTransaction, getCommissionTransactions } from "../../commissionUtils";
import { Colors } from "../../constants/Colors";
import { db } from "../../firebaseConfig";
import { getFirebaseAuth } from '../../firebaseConfig';
import { useColorScheme } from "../../hooks/useColorScheme";

const auth = getFirebaseAuth();
const UPI_ID = "skooty@upi";

type Transaction = {
    id: string;
    amount: number;
    paymentId: string;
    status: string;
    paidAt?: { toDate: () => Date };
};

export default function CommissionSummaryScreen() {
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    const colorScheme = useColorScheme() ?? 'light';
    const background = Colors[colorScheme].background;
    const card = Colors[colorScheme].surface;
    const text = Colors[colorScheme].text;
    const heading = Colors[colorScheme].secondary;
    const accent = Colors[colorScheme].primary;
    const error = colorScheme === 'light' ? '#dc2626' : '#f87171';
    const buttonBg = Colors[colorScheme].primary;
    const buttonText = Colors[colorScheme].surface;

    useEffect(() => {
        if (!auth.currentUser?.uid) return;
        setLoading(true);
        const driverRef = doc(db, 'drivers', auth.currentUser.uid);
        const unsubscribeDriver = onSnapshot(driverRef, (docSnap) => {
            setSummary(docSnap.exists() ? docSnap.data() : null);
            setLoading(false);
        });

        setLoadingTransactions(true);
        const paymentsRef = collection(db, "drivers", auth.currentUser.uid, "commissionPayments");
        const q = query(paymentsRef, orderBy("paidAt", "desc"));
        const unsubscribePayments = onSnapshot(q, (snapshot) => {
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
            console.log('Commission transactions:', txns);
            setTransactions(txns);
            setLoadingTransactions(false);
        }, (error) => {
            console.error('Error fetching commission transactions:', error);
            setLoadingTransactions(false);
        });

        return () => {
            unsubscribeDriver();
            unsubscribePayments();
        };
    }, []);

    if (loading) {
        return (
            <View style={[styles.flex, { backgroundColor: background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.loading, { color: text, fontFamily: 'Poppins-Medium' }]}>Loading...</Text>
            </View>
        );
    }

    if (!summary) {
        return (
            <View style={[styles.flex, { backgroundColor: Colors.light.surface, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.loading, { color: text, fontFamily: 'Poppins-Medium' }]}>No data found.</Text>
            </View>
        );
    }

    const { totalEarnings = 0, commissionDue = 0, totalCommissionPaid = 0, pendingCommission = 0, name = '' } = summary;

    const handleRazorpayPayment = () => {
        const options = {
            description: 'Commission Payment',
            image: undefined, // Optionally add your logo URL
            currency: 'INR',
            key: 'rzp_live_m1qfDdgI9r1AGQ', // TODO: Replace with your Razorpay key
            amount: Math.round(pendingCommission * 100), // amount in paise
            name: 'Skooty Platform',
            prefill: {
                email: '', // Optionally use driver's email
                contact: '', // Optionally use driver's phone
                name: name || 'Driver'
            },
            theme: { color: accent }
        };

        RazorpayCheckout.open(options)
            .then(async (data: any) => {
                Alert.alert('Payment Success', 'Commission paid successfully!');
                await markCommissionPaid(auth.currentUser?.uid, pendingCommission);
                // Add transaction record
                await addCommissionTransaction(auth.currentUser?.uid, {
                    amount: pendingCommission,
                    paymentId: data.razorpay_payment_id || '',
                    status: 'success',
                });
                const updated = await getCommissionSummary(auth.currentUser?.uid);
                setSummary(updated);
                // Refresh transactions
                setLoadingTransactions(true);
                const txns = await getCommissionTransactions(auth.currentUser?.uid);
                setTransactions(txns);
                setLoadingTransactions(false);
            })
            .catch((error: any) => {
                console.log('Razorpay error:', error);
                console.debug('Razorpay payment failed', {
                    error,
                    options,
                    userId: auth.currentUser?.uid,
                    pendingCommission,
                });
                Alert.alert('Payment Failed', error.description || 'Payment was not completed.');
            });
    };

    return (
        <View style={{ flex: 1, backgroundColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 24 }}>
            {/* Greeting and Info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.primary, fontFamily: 'Poppins-Medium' }}>
                    {name ? `Hi, ${name.split(' ')[0]}` : 'Commission Summary'}
                </Text>
                <Pressable
                    onPress={() => Alert.alert(
                        'What is the platform support fee?',
                        'Skooty charges a 15% platform support fee on your total ride earnings. This helps us maintain the app, provide support, and cover platform fees.'
                    )}
                    style={{ padding: 4 }}
                >
                    <MaterialCommunityIcons name="information-outline" size={26} color={Colors.light.secondary} />
                </Pressable>
            </View>
            {/* Card with metrics */}
            <View style={styles.cardModern}>
                <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, { fontFamily: 'Poppins-Medium' }]}>Total Earnings</Text>
                    <Text style={[styles.metricValue, { fontFamily: 'Poppins-Medium' }]}>₹{totalEarnings.toFixed(2)}</Text>
                </View>
                <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, { fontFamily: 'Poppins-Medium' }]}>Platform Fee Due</Text>
                    <Text style={[styles.metricValue, { fontFamily: 'Poppins-Medium' }]}>₹{commissionDue.toFixed(2)}</Text>
                </View>
                <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, { fontFamily: 'Poppins-Medium' }]}>Paid to Platform</Text>
                    <Text style={[styles.metricValue, { fontFamily: 'Poppins-Medium' }]}>₹{totalCommissionPaid.toFixed(2)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={[styles.metricRow, { marginTop: 10 }]}>
                    <Text style={[styles.metricLabel, { fontWeight: 'bold', fontFamily: 'Poppins-Medium' }]}>Amount Remaining</Text>
                    <Text style={[styles.amountRemaining, { color: error, fontFamily: 'Poppins-Medium' }]}>₹{pendingCommission.toFixed(2)}</Text>
                </View>
            </View>
            <View style={{ alignItems: 'center', marginTop: 32 }}>
                <TouchableOpacity
                    style={{
                        backgroundColor: Colors.light.primary,
                        borderRadius: 14,
                        paddingVertical: 16,
                        paddingHorizontal: 40,
                        alignItems: 'center',
                        marginBottom: 12,
                        shadowColor: Colors.light.primary,
                        shadowOpacity: 0.18,
                        shadowRadius: 8,
                        elevation: 3,
                        opacity: pendingCommission <= 0 ? 0.5 : 1
                    }}
                    onPress={handleRazorpayPayment}
                    disabled={pendingCommission <= 0}
                >
                    <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 18, letterSpacing: 0.2, fontFamily: 'Poppins-Medium' }}>Pay Platform Fee</Text>
                </TouchableOpacity>
            </View>
            {/* Transaction History */}
            {/* <View style={{ marginTop: 32 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: Colors.light.primary, fontFamily: 'Poppins-Medium' }}>Commission Payment History</Text>
                {loadingTransactions ? (
                    <Text style={{ color: text, fontFamily: 'Poppins-Medium' }}>Loading transactions...</Text>
                ) : transactions.length === 0 ? (
                    <Text style={{ color: text, fontFamily: 'Poppins-Medium' }}>No transactions found.</Text>
                ) : (
                    transactions.map((txn) => (
                        <View key={txn.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.surface }}>
                            <Text style={{ color: text, fontFamily: 'Poppins-Medium' }}>Amount: ₹{txn.amount?.toFixed(2)}</Text>
                            <Text style={{ color: Colors.light.secondary, fontSize: 13, fontFamily: 'Poppins-Medium' }}>Date: {txn.paidAt?.toDate ? txn.paidAt.toDate().toLocaleString() : ''}</Text>
                            <Text style={{ color: Colors.light.secondary, fontSize: 13, fontFamily: 'Poppins-Medium' }}>Payment ID: {txn.paymentId}</Text>
                            <Text style={{ color: txn.status === 'success' ? 'green' : error, fontFamily: 'Poppins-Medium' }}>Status: {txn.status}</Text>
                        </View>
                    ))
                )}
            </View> */} 
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 28, textAlign: 'center', letterSpacing: 0.5, fontFamily: 'Poppins-Medium' },
    card: {
        borderRadius: 20,
        padding: 28,
        marginBottom: 28,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    // Modern card style
    cardModern: {
        borderRadius: 18,
        padding: 26,
        marginBottom: 18,
        backgroundColor: Colors.light.card,
        shadowColor: Colors.light.primary,
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
    },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    metricLabel: {
        fontSize: 15,
        color: Colors.light.secondary,
        fontFamily: 'Poppins-Medium',
    },
    metricValue: {
        fontWeight: 'bold',
        color: Colors.light.primary,
        fontSize: 17,
        fontFamily: 'Poppins-Medium',
    },
    amountRemaining: {
        fontWeight: 'bold',
        fontSize: 20,
        letterSpacing: 0.2,
        fontFamily: 'Poppins-Medium',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.light.surface,
        marginVertical: 8,
    },
    label: { fontSize: 17, marginBottom: 10, letterSpacing: 0.1, fontFamily: 'Poppins-Medium' },
    value: { fontWeight: 'bold', fontFamily: 'Poppins-Medium' },
    button: {
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        alignItems: 'center',
        marginBottom: 8,
        minWidth: 180,
    },
    buttonText: { fontWeight: 'bold', fontSize: 18, letterSpacing: 0.2, fontFamily: 'Poppins-Medium' },
    loading: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.2, fontFamily: 'Poppins-Medium' },
}); 