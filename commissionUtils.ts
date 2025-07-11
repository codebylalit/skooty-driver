import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

export async function updateCommission(driverId: string, newEarnings: number) {
  try {
    console.log('[updateCommission] driverId:', driverId, 'newEarnings:', newEarnings);
    const driverRef = doc(db, "drivers", driverId);
    const driverSnap = await getDoc(driverRef);
    let totalEarnings = newEarnings;
    let totalCommissionPaid = 0;
    let prevTotalEarnings = 0;

    if (driverSnap.exists()) {
      const data = driverSnap.data();
      prevTotalEarnings = data.totalEarnings || 0;
      totalEarnings += prevTotalEarnings;
      totalCommissionPaid = data.totalCommissionPaid || 0;
      console.log('[updateCommission] Previous totalEarnings:', prevTotalEarnings, 'totalCommissionPaid:', totalCommissionPaid);
    }

    const commissionDue = totalEarnings * 0.15;
    const pendingCommission = commissionDue - totalCommissionPaid;

    console.log('[updateCommission] Writing:', {
      totalEarnings,
      commissionDue,
      totalCommissionPaid,
      pendingCommission,
    });

    await updateDoc(driverRef, {
      totalEarnings,
      commissionDue,
      totalCommissionPaid,
      pendingCommission,
    });
  } catch (err) {
    console.error('[updateCommission] Error:', err);
  }
}

export async function markCommissionPaid(driverId: string, amount: number) {
  const driverRef = doc(db, "drivers", driverId);
  const driverSnap = await getDoc(driverRef);

  if (!driverSnap.exists()) return;

  const data = driverSnap.data();
  const totalCommissionPaid = (data.totalCommissionPaid || 0) + amount;
  const commissionDue = data.commissionDue || 0;
  const pendingCommission = commissionDue - totalCommissionPaid;

  await updateDoc(driverRef, {
    totalCommissionPaid,
    pendingCommission,
  });
}

export async function getCommissionSummary(driverId: string) {
  const driverRef = doc(db, "drivers", driverId);
  const driverSnap = await getDoc(driverRef);
  if (!driverSnap.exists()) return null;
  return driverSnap.data();
}

export async function addCommissionTransaction(driverId: string, transaction: {
  amount: number;
  paymentId: string;
  status: string;
}) {
  const paymentsRef = collection(db, "drivers", driverId, "commissionPayments");
  try {
    console.log('Adding commission transaction:', driverId, transaction);
    await addDoc(paymentsRef, {
      ...transaction,
      paidAt: Timestamp.now(),
    });
    console.log('Transaction added successfully');
  } catch (error) {
    console.error('Error adding commission transaction:', error);
  }
}

export async function getCommissionTransactions(driverId: string) {
  const paymentsRef = collection(db, "drivers", driverId, "commissionPayments");
  const q = query(paymentsRef, orderBy("paidAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
} 