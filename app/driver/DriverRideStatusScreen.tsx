import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import tw from 'tailwind-react-native-classnames';
import { db } from '@/app/firebaseConfig';

const STATUS_FLOW = [
  'Driver on the way',
  'Ride in progress',
  'Completed',
];

export default function DriverRideStatusScreen({ route, navigation }) {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusIndex, setStatusIndex] = useState(0);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchRide = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'rides', rideId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRide({ id: docSnap.id, ...docSnap.data() });
          const idx = STATUS_FLOW.indexOf(docSnap.data().status);
          setStatusIndex(idx >= 0 ? idx : 0);
        }
      } catch (e) {
        Alert.alert('Error', 'Could not fetch ride.');
      } finally {
        setLoading(false);
      }
    };
    fetchRide();
  }, [rideId]);

  const advanceStatus = async () => {
    if (!ride) return;
    const nextIndex = Math.min(statusIndex + 1, STATUS_FLOW.length - 1);
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'rides', ride.id), {
        status: STATUS_FLOW[nextIndex],
      });
      setStatusIndex(nextIndex);
      setRide({ ...ride, status: STATUS_FLOW[nextIndex] });
      if (nextIndex === STATUS_FLOW.length - 1) {
        Alert.alert('Ride Completed', 'Ride is completed!');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update ride status.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <View style={tw`flex-1 justify-center items-center bg-white`}><ActivityIndicator size="large" /></View>;
  }
  if (!ride) {
    return <View style={tw`flex-1 justify-center items-center bg-white`}><Text>No ride found.</Text></View>;
  }

  return (
    <View style={tw`flex-1 justify-center items-center bg-white px-8`}>
      <Text style={tw`text-2xl font-bold text-blue-600 mb-4`}>Ride Status</Text>
      <Text style={tw`text-xl text-gray-700 mb-4`}>{ride.status}</Text>
      <Text style={tw`text-base text-gray-500 mb-2`}>Fare: ₹{ride.fare}</Text>
      <Text style={tw`text-base text-gray-500 mb-2`}>Pickup: {ride.pickup?.latitude?.toFixed(5)}, {ride.pickup?.longitude?.toFixed(5)}</Text>
      <Text style={tw`text-base text-gray-500 mb-4`}>Drop-off: {ride.dropoff?.latitude?.toFixed(5)}, {ride.dropoff?.longitude?.toFixed(5)}</Text>
      {statusIndex < STATUS_FLOW.length - 1 && (
        <TouchableOpacity
          style={tw`bg-blue-600 py-3 rounded-xl w-full mb-2`}
          onPress={advanceStatus}
          disabled={updating}
        >
          <Text style={tw`text-white text-center text-lg font-semibold`}>{updating ? 'Updating...' : 'Advance Status'}</Text>
        </TouchableOpacity>
      )}
      {statusIndex === STATUS_FLOW.length - 1 && (
        <TouchableOpacity
          style={tw`bg-green-600 py-3 rounded-xl w-full`}
          onPress={() => navigation.navigate('DriverHome')}
        >
          <Text style={tw`text-white text-center text-lg font-semibold`}>Go to Home</Text>
        </TouchableOpacity>
      )}
    </View>
  );
} 