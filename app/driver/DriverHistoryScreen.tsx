import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import tw from 'tailwind-react-native-classnames';
import { auth, db } from '@/app/firebaseConfig';

export default function DriverHistoryScreen() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRides = async () => {
      setLoading(true);
      setError('');
      try {
        const user = auth.currentUser;
        if (!user) {
          setError('You must be logged in to view ride history.');
          setLoading(false);
          return;
        }
        const q = query(
          collection(db, 'rides'),
          where('driverId', '==', user.uid),
          where('status', '==', 'Completed'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRides(data);
      } catch (e) {
        setError('Could not fetch ride history.');
      } finally {
        setLoading(false);
      }
    };
    fetchRides();
  }, []);

  if (loading) {
    return <View style={tw`flex-1 justify-center items-center bg-white`}><ActivityIndicator size="large" /></View>;
  }
  if (error) {
    return <View style={tw`flex-1 justify-center items-center bg-white`}><Text style={tw`text-red-500`}>{error}</Text></View>;
  }

  return (
    <View style={tw`flex-1 bg-white px-4 pt-8`}>
      <Text style={tw`text-2xl font-bold text-blue-600 mb-6 text-center`}>Completed Rides</Text>
      <FlatList
        data={rides}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={tw`mb-4 border border-gray-200 rounded-xl p-4 bg-gray-50`}> 
            <Text style={tw`text-base text-gray-700 mb-1`}>Fare: ₹{item.fare}</Text>
            <Text style={tw`text-base text-gray-500 mb-1`}>Pickup: {item.pickup?.latitude?.toFixed(5)}, {item.pickup?.longitude?.toFixed(5)}</Text>
            <Text style={tw`text-base text-gray-500 mb-1`}>Drop-off: {item.dropoff?.latitude?.toFixed(5)}, {item.dropoff?.longitude?.toFixed(5)}</Text>
            <Text style={tw`text-base text-gray-400`}>Date: {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'N/A'}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={tw`text-center text-gray-400`}>No completed rides found.</Text>}
      />
    </View>
  );
} 