import { auth, db } from '@/app/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getAuth, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import tw from 'tailwind-react-native-classnames';

const typedAuth: ReturnType<typeof getAuth> = auth;

// Add types for driver profile and ride
interface DriverProfile {
  name?: string;
  mobile?: string;
  license?: string;
  vehicle?: string;
  profilePhotoUrl?: string;
}
interface Ride {
  id: string;
  fare?: number;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  createdAt?: any;
}

export default function DriverHomeScreen({ navigation }: { navigation: any }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'available' | 'history' | 'profile'>('available');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [history, setHistory] = useState<Ride[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editProfile, setEditProfile] = useState<DriverProfile | null>(null);
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setProfileLoading(true);
      try {
        const user = typedAuth.currentUser;
        if (!user) return;
        const docSnap = await getDoc(doc(db, 'drivers', user.uid));
        if (docSnap.exists()) setProfile(docSnap.data());
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    let interval: any;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission denied. Nearby rides will not be shown.');
          return;
        }
        const updateLocation = async () => {
          const loc = await Location.getCurrentPositionAsync({});
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setLocation(coords);
          const user = typedAuth.currentUser;
          if (user) {
            await updateDoc(doc(db, 'drivers', user.uid), { location: coords });
          }
        };
        await updateLocation();
        interval = setInterval(updateLocation, 30000); // update every 30 seconds
      } catch (e) {
        setLocationError('Could not fetch location.');
      }
    })();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (view === 'available') {
      setLoading(true);
      setError('');
      (async () => {
      try {
        const q = query(collection(db, 'rides'), where('status', '==', 'booked'), where('driverId', '==', null));
        const querySnapshot = await getDocs(q);
          let data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Filter by proximity if location is available
          if (location) {
            data = data.filter(ride => {
              if (!ride.pickup) return false;
              const toRad = (v) => (v * Math.PI) / 180;
              const R = 6371; // km
              const dLat = toRad(ride.pickup.latitude - location.latitude);
              const dLon = toRad(ride.pickup.longitude - location.longitude);
              const lat1 = toRad(location.latitude);
              const lat2 = toRad(ride.pickup.latitude);
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const d = R * c;
              return d <= 3; // within 3 km
            });
          }
        setRides(data);
      } catch (e) {
        setError('Could not fetch rides.');
      } finally {
        setLoading(false);
        }
      })();
    } else if (view === 'history') {
      setHistoryLoading(true);
      (async () => {
        try {
          const user = typedAuth.currentUser;
          if (!user) return;
          const q = query(
            collection(db, 'rides'),
            where('driverId', '==', user.uid),
            where('status', '==', 'Completed'),
            orderBy('createdAt', 'desc')
          );
          const querySnapshot = await getDocs(q);
          const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setHistory(data);
        } finally {
          setHistoryLoading(false);
        }
      })();
    }
  }, [view, location]);

  useEffect(() => {
    if (view === 'profile' && profile) {
      setEditProfile({ ...profile });
      setEditPhoto(profile.profilePhotoUrl || null);
    }
  }, [view, profile]);

  const pickEditProfilePhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      setEditPhoto(result.assets[0].uri as string);
    }
  };

  const handleSaveProfile = async () => {
    if (!editProfile) return;
    setSavingProfile(true);
    try {
      const user = typedAuth.currentUser;
      if (!user) throw new Error('Not logged in');
      let profilePhotoUrl = editPhoto;
      if (editPhoto && editPhoto !== profile?.profilePhotoUrl) {
        const storage = getStorage();
        const response = await fetch(editPhoto);
        const blob = await response.blob();
        const storageRef = ref(storage, `driverProfilePhotos/${user.uid}`);
        await uploadBytes(storageRef, blob);
        profilePhotoUrl = await getDownloadURL(storageRef);
      }
      await updateDoc(doc(db, 'drivers', user.uid), {
        name: editProfile.name,
        mobile: editProfile.mobile,
        license: editProfile.license,
        vehicle: editProfile.vehicle,
        profilePhotoUrl,
      });
      setProfile({ ...profile, ...editProfile, profilePhotoUrl } as DriverProfile);
      Alert.alert('Success', 'Profile updated!');
      setView('available');
    } catch (e) {
      Alert.alert('Error', 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    try {
      const user = typedAuth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in as a driver.');
        return;
      }
      await updateDoc(doc(db, 'rides', rideId), {
        driverId: user.uid,
        status: 'Driver on the way',
      });
      Alert.alert('Success', 'Ride accepted!');
      navigation.navigate('DriverRideStatus', { rideId });
    } catch (e) {
      Alert.alert('Error', 'Could not accept ride.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(typedAuth);
      navigation.replace('DriverLogin');
    } catch (e) {
      Alert.alert('Error', 'Could not log out.');
    }
  };

  return (
    <View style={tw`flex-1 bg-white`}>
      {/* Hamburger Menu Icon */}
      <TouchableOpacity style={{ position: 'absolute', top: 36, left: 18, zIndex: 20 }} onPress={() => setMenuVisible(true)}>
        <Icon name="menu" size={32} color="#1976d2" />
      </TouchableOpacity>
      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }} onPress={() => setMenuVisible(false)}>
          <View style={{ position: 'absolute', top: 60, left: 16, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24, elevation: 8, minWidth: 180 }}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }} onPress={() => { setMenuVisible(false); setView('profile'); }}>
              <Icon name="account-circle" size={24} color="#1976d2" style={{ marginRight: 10 }} />
              <Text style={tw`text-base text-blue-900`}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }} onPress={() => { setMenuVisible(false); setView('available'); }}>
              <Icon name="home" size={24} color="#1976d2" style={{ marginRight: 10 }} />
              <Text style={tw`text-base text-blue-900`}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleLogout}>
              <Icon name="logout" size={24} color="#e53935" style={{ marginRight: 10 }} />
              <Text style={tw`text-base text-red-700`}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
      <ScrollView style={tw`flex-1 bg-white`} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profile Card */}
        <View style={tw`items-center bg-blue-50 rounded-2xl px-6 py-6 mt-6 mx-2 mb-4 shadow`}> 
          {profileLoading ? (
            <ActivityIndicator size="large" />
          ) : profile ? (
            <>
              {profile.profilePhotoUrl && (
                <Image source={{ uri: profile.profilePhotoUrl }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8, borderWidth: 2, borderColor: '#1976d2' }} />
              )}
              <Text style={tw`text-lg font-bold text-blue-900 mb-1`}>{profile.name}</Text>
              <Text style={tw`text-base text-gray-700 mb-1`}>Mobile: {profile.mobile}</Text>
              <Text style={tw`text-base text-gray-700 mb-1`}>License: {profile.license}</Text>
              <Text style={tw`text-base text-gray-700 mb-1`}>Vehicle: {profile.vehicle}</Text>
              <TouchableOpacity style={tw`mt-2 bg-blue-600 px-4 py-2 rounded-xl`} onPress={() => setView('profile')}>
                <Text style={tw`text-white font-semibold`}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={tw`text-gray-500`}>No profile found.</Text>
          )}
        </View>
        {/* Navigation Tabs */}
        <View style={tw`flex-row justify-around mb-4`}> 
          <TouchableOpacity onPress={() => setView('available')} style={[tw`px-4 py-2 rounded-full`, { backgroundColor: view === 'available' ? '#1976d2' : '#e3f0ff' }]}> 
            <Text style={tw`${view === 'available' ? 'text-white' : 'text-blue-900'} font-semibold`}>Available Rides</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView('history')} style={[tw`px-4 py-2 rounded-full`, { backgroundColor: view === 'history' ? '#1976d2' : '#e3f0ff' }]}> 
            <Text style={tw`${view === 'history' ? 'text-white' : 'text-blue-900'} font-semibold`}>My Completed Rides</Text>
          </TouchableOpacity>
        </View>
        {/* Main Content */}
        {view === 'available' && (
          <>
            {locationError && (
              <Text style={tw`text-red-500 text-center mb-2`}>{locationError}</Text>
            )}
            <Text style={tw`text-xl font-bold text-gray-800 mb-2 ml-2`}>Available Rides</Text>
            {loading ? (
              <ActivityIndicator size="large" />
            ) : error ? (
              <Text style={tw`text-red-500 text-center`}>{error}</Text>
            ) : (
      <FlatList
        data={rides}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
                  <View style={tw`mb-4 border border-gray-200 rounded-xl p-4 bg-gray-50 mx-2`}> 
            <Text style={tw`text-base text-gray-700 mb-1`}>Fare: ₹{item.fare}</Text>
            <Text style={tw`text-base text-gray-500 mb-1`}>Pickup: {item.pickup?.latitude?.toFixed(5)}, {item.pickup?.longitude?.toFixed(5)}</Text>
            <Text style={tw`text-base text-gray-500 mb-3`}>Drop-off: {item.dropoff?.latitude?.toFixed(5)}, {item.dropoff?.longitude?.toFixed(5)}</Text>
            <TouchableOpacity
              style={tw`bg-blue-600 py-3 rounded-xl w-full`}
              onPress={() => handleAcceptRide(item.id)}
            >
              <Text style={tw`text-white text-center text-lg font-semibold`}>Accept Ride</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={tw`text-center text-gray-400`}>No available rides.</Text>}
      />
            )}
          </>
        )}
        {view === 'history' && (
          <>
            <Text style={tw`text-xl font-bold text-gray-800 mb-2 ml-2`}>Completed Rides</Text>
            {historyLoading ? (
              <ActivityIndicator size="large" />
            ) : (
              <FlatList
                data={history}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={tw`mb-4 border border-gray-200 rounded-xl p-4 bg-gray-50 mx-2`}> 
                    <Text style={tw`text-base text-gray-700 mb-1`}>Fare: ₹{item.fare}</Text>
                    <Text style={tw`text-base text-gray-500 mb-1`}>Pickup: {item.pickup?.latitude?.toFixed(5)}, {item.pickup?.longitude?.toFixed(5)}</Text>
                    <Text style={tw`text-base text-gray-500 mb-1`}>Drop-off: {item.dropoff?.latitude?.toFixed(5)}, {item.dropoff?.longitude?.toFixed(5)}</Text>
                    <Text style={tw`text-base text-gray-400`}>Date: {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'N/A'}</Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={tw`text-center text-gray-400`}>No completed rides found.</Text>}
              />
            )}
          </>
        )}
        {view === 'profile' && (
          <View style={tw`bg-white rounded-2xl px-6 py-6 mx-2 mt-2 mb-8 shadow`}>
            <Text style={tw`text-xl font-bold text-blue-900 mb-4 text-center`}>Edit Profile</Text>
            {editProfile && (
              <>
                <TouchableOpacity style={tw`items-center mb-4`} onPress={pickEditProfilePhoto}>
                  {editPhoto ? (
                    <Image source={{ uri: editPhoto }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8, borderWidth: 2, borderColor: '#1976d2' }} />
                  ) : (
                    <View style={[tw`bg-blue-100 rounded-full`, { width: 80, height: 80, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="account" size={40} color="#1976d2" />
                    </View>
                  )}
                  <Text style={tw`text-blue-700 underline`}>Change Photo</Text>
                </TouchableOpacity>
                <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Full Name</Text>
                <TextInput
                  value={editProfile.name}
                  onChangeText={v => setEditProfile({ ...editProfile, name: v })}
                  style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
                  placeholder="Full Name"
                />
                <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Mobile Number</Text>
                <TextInput
                  value={editProfile.mobile}
                  onChangeText={v => setEditProfile({ ...editProfile, mobile: v })}
                  style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
                  placeholder="Mobile Number"
                  keyboardType="phone-pad"
                />
                <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Driving License Number</Text>
                <TextInput
                  value={editProfile.license}
                  onChangeText={v => setEditProfile({ ...editProfile, license: v })}
                  style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
                  placeholder="License Number"
                />
                <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Vehicle Number</Text>
                <TextInput
                  value={editProfile.vehicle}
                  onChangeText={v => setEditProfile({ ...editProfile, vehicle: v })}
                  style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
                  placeholder="Vehicle Number"
                />
                <TouchableOpacity style={tw`bg-green-600 py-3 rounded-xl w-full mt-2`} onPress={handleSaveProfile} disabled={savingProfile}>
                  <Text style={tw`text-white text-center text-lg font-semibold`}>{savingProfile ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={tw`bg-blue-600 py-3 rounded-xl w-full mt-4`} onPress={() => setView('available')}>
              <Text style={tw`text-white text-center text-lg font-semibold`}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
} 