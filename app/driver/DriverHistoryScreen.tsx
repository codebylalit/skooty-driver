import { useNavigation } from '@react-navigation/native';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
// @ts-ignore
import { Colors } from '../../constants/Colors';
// @ts-ignore
import tw from 'tailwind-react-native-classnames';
import { auth, db } from '../../firebaseConfig';

export default function DriverHistoryScreen() {
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigation: any = useNavigation();

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
    return <View style={tw`flex-1 justify-center items-center bg-white`}><ActivityIndicator size="large" color={Colors.light.primary} /></View>;
  }
  if (error) {
    return <View style={tw`flex-1 justify-center items-center bg-white`}><Text style={tw`text-red-500 text-base text-center`}>{error}</Text></View>;
  }

} 