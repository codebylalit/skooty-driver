// @ts-ignore
import { auth as rawAuth, db as rawDb, storage as rawStorage } from '../../firebaseConfig';
// @ts-ignore
import * as ImagePicker from 'expo-image-picker';
// @ts-ignore
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-root-toast';
// @ts-ignore
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/Colors';

// @ts-ignore
const auth = rawAuth;
// @ts-ignore
const db = rawDb;
// @ts-ignore
const storage = rawStorage;

// Add types for driver profile and ride
interface DriverProfile {
  name?: string;
  mobile?: string;
  license?: string;
  vehicle?: string;
  profilePhotoUrl?: string | null;
  vehicleType?: 'auto' | 'bike';
  bikeModel?: string; // <-- Added
  verificationStatus?: 'pending' | 'verified' | 'rejected'; // <-- Added
}
interface Ride {
  id: string;
  status?: string;
  fare?: number;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  createdAt?: any;
  paymentMethod?: 'cash' | 'online';
  driverId?: string | null;
  vehicleType?: 'auto' | 'bike';
}

// Define the param list for navigation
// (adjust as needed for your app's navigation structure)
type RootStackParamList = {
  DriverHome: undefined;
  Profile: { showProfile: boolean } | undefined;
  DriverHistory: undefined;
  DriverVerification: undefined; // <-- Added
};

// Add validation helpers
const isValidProfile = (profile: DriverProfile | null) => {
  if (!profile) return false;
  if (!profile.name || !profile.mobile || !profile.license || !profile.vehicle || !profile.vehicleType) return false;
  // Simple mobile and license validation (customize as needed)
  if (!/^\d{10}$/.test(profile.mobile)) return false;
  if (profile.license.length < 5) return false;
  return true;
};

// Helper to get address from coordinates with cache
const addressCache: { [key: string]: string } = {};
async function getAddressFromCoords(coords: { latitude: number; longitude: number }): Promise<string> {
  if (!coords) return '';
  const key = `${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
  if (addressCache[key]) return addressCache[key];
  try {
    const results = await Location.reverseGeocodeAsync(coords);
    if (results && results.length > 0) {
      const { street, city, name, district, region } = results[0];
      // Compose a short address: street + city (or district/region)
      const address = [street || name, city || district || region].filter(Boolean).join(', ');
      addressCache[key] = address;
      return address;
    }
  } catch (e) {
    // ignore
  }
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

export default function DriverHomeScreen({ navigation: propNavigation, route }: { navigation: any, route: any }) {
  const navigation = useNavigation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'available' | 'history' | 'profile' | 'all'>('available');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [history, setHistory] = useState<Ride[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [allRidesLoading, setAllRidesLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editProfile, setEditProfile] = useState<DriverProfile | null>(null);
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [profileErrors, setProfileErrors] = useState<{ [k: string]: string }>({});
  const [pickupAddresses, setPickupAddresses] = useState<{ [rideId: string]: string }>({});
  const [dropoffAddresses, setDropoffAddresses] = useState<{ [rideId: string]: string }>({});
  const [historyPickupAddresses, setHistoryPickupAddresses] = useState<{ [rideId: string]: string }>({});
  const [historyDropoffAddresses, setHistoryDropoffAddresses] = useState<{ [rideId: string]: string }>({});
  const [acceptingRide, setAcceptingRide] = useState<string | null>(null);
  const [checkingActiveRide, setCheckingActiveRide] = useState(true);
  const [currentTab, setCurrentTab] = useState<'home' | 'profile'>('home');



  // Function to check for active rides
  const checkForActiveRide = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Check for rides that are not completed or cancelled
      const activeRidesQuery = query(
        collection(db, 'rides'),
        where('driverId', '==', user.uid),
        where('status', 'in', ['Driver on the way', 'Ride in progress'])
      );

      const querySnapshot = await getDocs(activeRidesQuery);

      if (!querySnapshot.empty) {
        // Found an active ride, redirect to ride status screen
        const activeRide = querySnapshot.docs[0];
        console.log('Found active ride:', activeRide.id);
        (navigation as any).navigate('DriverRideStatus', { rideId: activeRide.id });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking for active rides:', error);
      return false;
    }
  };

  useEffect(() => {
    const unsubscribe = propNavigation.addListener('focus', async () => {
      console.log('Screen focused, route params:', route?.params);

      // Check for active rides when screen comes into focus
      const hasActiveRide = await checkForActiveRide();
      if (hasActiveRide) {
        return; // Don't proceed with normal focus logic if we're redirecting
      }

      // Refresh profile data when screen comes into focus
      if (!route?.params?.showProfile) {
        // We're on the Home tab, refresh profile
        await refreshProfile();
      }

      if (route?.params?.showProfile) {
        setView('profile');
        setCurrentTab('profile');
      } else {
        setView('available');
        setCurrentTab('home');
      }
    });
    return unsubscribe;
  }, [propNavigation, route?.params?.showProfile]);

  // Check for active rides on component mount
  useEffect(() => {
    const checkActiveRideOnMount = async () => {
      console.log('Component mount - checking auth and active rides');
      const user = auth.currentUser;
      console.log('Current user on mount:', user ? user.uid : 'null');

      setCheckingActiveRide(true);
      const hasActiveRide = await checkForActiveRide();
      if (!hasActiveRide) {
        // Only proceed with normal initialization if no active ride
        if (route?.params?.showProfile) {
          setView('profile');
          setCurrentTab('profile');
        } else {
          setView('available');
          setCurrentTab('home');
        }
      }
      setCheckingActiveRide(false);
    };

    checkActiveRideOnMount();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      console.log('Starting profile fetch...');
      setProfileLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) {
          console.log('No user is logged in.');
          setProfileLoading(false);
          return;
        }

        console.log('Fetching profile for user:', user.uid);
        const docRef = doc(db, 'drivers', user.uid);
        const docSnap = await getDoc(docRef);

        console.log('Document exists:', docSnap.exists());
        if (docSnap.exists()) {
          const profileData = docSnap.data();
          console.log('Profile data fetched:', profileData);
          console.log('Profile validation result:', isValidProfile(profileData));
          setProfile(profileData);
        } else {
          console.log('No driver document found for uid:', user.uid);
          setProfile(null);
        }
      } catch (err) {
        console.error('Error fetching driver profile:', err);
        setProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    // Add a small delay to ensure auth is ready
    const timer = setTimeout(() => {
      fetchProfile();
    }, 1000); // Increased delay to ensure auth is ready

    return () => clearTimeout(timer);
  }, []);

  // Real-time profile listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      console.log('No user found for real-time listener');
      return;
    }

    console.log('Setting up real-time profile listener for user:', user.uid);
    const docRef = doc(db, 'drivers', user.uid);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      console.log('Real-time listener triggered, exists:', docSnap.exists());
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        console.log('Real-time profile update:', profileData);
        setProfile(profileData);
        setProfileLoading(false);
      } else {
        console.log('Real-time: No driver document found');
        setProfile(null);
        setProfileLoading(false);
      }
    }, (error) => {
      console.error('Real-time profile listener error:', error);
      setProfileLoading(false);
    });

    return () => {
      console.log('Cleaning up real-time profile listener');
      unsubscribe();
    };
  }, []);

  // Manual profile refresh function
  const refreshProfile = async () => {
    console.log('Manual profile refresh triggered');
    const user = auth.currentUser;
    if (!user) {
      console.log('No user found for manual refresh');
      return;
    }

    setProfileLoading(true);
    try {
      console.log('Fetching profile for manual refresh, user:', user.uid);
      const docRef = doc(db, 'drivers', user.uid);
      const docSnap = await getDoc(docRef);

      console.log('Manual refresh - Document exists:', docSnap.exists());
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        console.log('Manual profile refresh successful:', profileData);
        setProfile(profileData);
      } else {
        console.log('Manual refresh: No driver document found');
        setProfile(null);
      }
    } catch (err) {
      console.error('Error in manual profile refresh:', err);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  // Auth state listener to ensure profile is fetched when user becomes authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed, user:', user ? user.uid : 'null');
      if (user) {
        // User is signed in, trigger profile fetch
        refreshProfile();
      } else {
        // User is signed out
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => unsubscribe();
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
          const user = auth.currentUser;
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
    let unsubscribe: (() => void) | undefined;
    if (view === 'available') {
      setLoading(true);
      setError('');

      console.log('Setting up available rides query...');
      console.log('Profile:', profile);
      console.log('Profile vehicle type:', profile?.vehicleType);
      console.log('Location:', location);

      // Only show rides if driver has a valid profile with vehicle type
      if (!profile || !profile.vehicleType) {
        console.log('No profile or vehicle type - not showing rides');
        setRides([]);
        setLoading(false);
        return;
      }

      // Check if driver already has an active ride
      (async () => {
        const user = auth.currentUser;
        if (user) {
          const activeRidesQuery = query(
            collection(db, 'rides'),
            where('driverId', '==', user.uid),
            where('status', 'in', ['Driver on the way', 'Ride in progress'])
          );

          const activeRidesSnapshot = await getDocs(activeRidesQuery);
          if (!activeRidesSnapshot.empty) {
            // Driver has an active ride, redirect to ride status
            const activeRide = activeRidesSnapshot.docs[0];
            console.log('Driver has active ride, redirecting to:', activeRide.id);
            (navigation as any).navigate('DriverRideStatus', { rideId: activeRide.id });
            setLoading(false);
            return;
          }
        }

        // Continue with normal ride fetching if no active ride
        // Update query to include both 'booked' and 'pending' status rides
        // AND filter by vehicle type
        const q = query(
          collection(db, 'rides'),
          where('status', 'in', ['booked', 'pending']),
          where('driverId', '==', null),
          where('vehicleType', '==', profile?.vehicleType)
        );

        console.log('Query set up for vehicle type:', profile?.vehicleType);

        unsubscribe = onSnapshot(q, (querySnapshot) => {
          let data = querySnapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
          console.log('Available rides found:', data.length);
          data.forEach(ride => {
            console.log('Ride:', { id: ride.id, status: ride.status, driverId: ride.driverId, fare: ride.fare, vehicleType: ride.vehicleType });
          });

          // Filter by proximity if location is available (increased radius to 10km)
          if (location) {
            const beforeFilter = data.length;
            data = data.filter((ride: Ride) => {
              if (!ride.pickup) return false;
              const toRad = (v: number) => (v * Math.PI) / 180;
              const R = 6371; // km
              const dLat = toRad(ride.pickup.latitude - location.latitude);
              const dLon = toRad(ride.pickup.longitude - location.longitude);
              const lat1 = toRad(location.latitude);
              const lat2 = toRad(ride.pickup.latitude);
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const d = R * c;
              const isWithinRange = d <= 10; // within 10 km (increased from 3km)
              console.log(`Ride ${ride.id}: distance=${d.toFixed(2)}km, within range=${isWithinRange}`);
              return isWithinRange;
            });
            console.log(`Location filter: ${beforeFilter} -> ${data.length} rides`);
          }
          setRides(data);
          setLoading(false);
        }, (e) => {
          setError('Could not fetch rides.');
          console.error('Error fetching rides:', e);
          if (e && e.code) {
            console.error('Firestore error code:', e.code);
          }
          if (e && e.message) {
            console.error('Firestore error message:', e.message);
          }
          setLoading(false);
        });
      })();
    } else if (view === 'history') {
      setHistoryLoading(true);
      (async () => {
        try {
          const user = auth.currentUser;
          if (!user) {
            console.log('No user found for history');
            return;
          }

          console.log('Fetching history for user:', user.uid);

          // FIXED: Query for completed rides that this driver has completed
          const q = query(
            collection(db, 'rides'),
            where('driverId', '==', user.uid),
            where('status', '==', 'Completed')
          );

          const querySnapshot = await getDocs(q);
          console.log('Completed rides found:', querySnapshot.docs.length);

          const completedRides = querySnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('Completed ride data:', { id: doc.id, status: data.status, driverId: data.driverId, fare: data.fare });
            return { id: doc.id, ...data } as Ride;
          });

          setHistory(completedRides);
        } catch (error) {
          console.error('Error fetching history:', error);
        } finally {
          setHistoryLoading(false);
        }
      })();
    } else if (view === 'all') {
      setAllRidesLoading(true);
      (async () => {
        try {
          const user = auth.currentUser;
          if (!user) return;

          console.log('Fetching ALL rides for user:', user.uid);

          const q = query(
            collection(db, 'rides'),
            where('driverId', '==', user.uid)
          );

          const querySnapshot = await getDocs(q);
          console.log('ALL rides found:', querySnapshot.docs.length);

          const rides = querySnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('ALL Ride data:', { id: doc.id, status: data.status, driverId: data.driverId, fare: data.fare });
            return { id: doc.id, ...data } as Ride;
          });

          setAllRides(rides);
        } catch (error) {
          console.error('Error fetching all rides:', error);
        } finally {
          setAllRidesLoading(false);
        }
      })();
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [view, location, profile?.vehicleType]); // Added profile.vehicleType dependency

  // Fetch addresses for available rides
  useEffect(() => {
    if (view !== 'available' || !rides.length) return;
    let cancelled = false;
    (async () => {
      const pickup: { [rideId: string]: string } = {};
      const dropoff: { [rideId: string]: string } = {};
      await Promise.all(rides.map(async (ride) => {
        if (ride.pickup) {
          pickup[ride.id] = await getAddressFromCoords(ride.pickup);
        }
        if (ride.dropoff) {
          dropoff[ride.id] = await getAddressFromCoords(ride.dropoff);
        }
      }));
      if (!cancelled) {
        setPickupAddresses(pickup);
        setDropoffAddresses(dropoff);
      }
    })();
    return () => { cancelled = true; };
  }, [rides, view]);

  // Fetch addresses for completed rides
  useEffect(() => {
    if (view !== 'history' || !history.length) return;
    let cancelled = false;
    (async () => {
      const pickup: { [rideId: string]: string } = {};
      const dropoff: { [rideId: string]: string } = {};
      await Promise.all(history.map(async (ride) => {
        if (ride.pickup) {
          pickup[ride.id] = await getAddressFromCoords(ride.pickup);
        }
        if (ride.dropoff) {
          dropoff[ride.id] = await getAddressFromCoords(ride.dropoff);
        }
      }));
      if (!cancelled) {
        setHistoryPickupAddresses(pickup);
        setHistoryDropoffAddresses(dropoff);
      }
    })();
    return () => { cancelled = true; };
  }, [history, view]);

  useEffect(() => {
    if (view === 'profile') {
      if (profile && isValidProfile(profile)) {
        setEditProfile({ ...profile });
        setEditPhoto(profile.profilePhotoUrl || null);
      } else {
        // Create empty profile for new users or incomplete profiles
        setEditProfile({
          name: profile?.name || '',
          mobile: profile?.mobile || '',
          license: profile?.license || '',
          vehicle: profile?.vehicle || '',
          vehicleType: profile?.vehicleType || 'auto',
          profilePhotoUrl: profile?.profilePhotoUrl || null
        });
        setEditPhoto(profile?.profilePhotoUrl || null);
      }
    }
  }, [view, profile]);

  useEffect(() => {
    // Removed invalid navigation.addListener('editProfile')
  }, []);

  const pickEditProfilePhoto = async () => {
    console.log('=== Starting image picker ===');
    try {
      console.log('Launching image library...');
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      console.log('Image picker result:', result);
      console.log('Result canceled:', result.canceled);
      console.log('Result assets:', result.assets);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];
        console.log('Selected image details:', {
          uri: selectedImage.uri,
          width: selectedImage.width,
          height: selectedImage.height,
          type: selectedImage.type,
          fileName: selectedImage.fileName
        });

        setEditPhoto(selectedImage.uri as string);
        console.log('EditPhoto state updated with:', selectedImage.uri);
      } else {
        console.log('Image selection was canceled or no assets found');
      }
    } catch (error: any) {
      console.error('Error in image picker:', error);
      console.error('Image picker error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
    }
    console.log('=== Image picker completed ===');
  };

  const handleSaveProfile = async () => {
    console.log('=== Starting profile save process ===');
    if (!editProfile) {
      console.log('No editProfile data available');
      return;
    }

    console.log('EditProfile data:', editProfile);
    console.log('Current editPhoto:', editPhoto);
    console.log('Current profile photo URL:', profile?.profilePhotoUrl);

    setSavingProfile(true);
    Keyboard.dismiss();

    try {
      const user = auth.currentUser;
      if (!user) {
        console.log('No authenticated user found');
        throw new Error('Not logged in');
      }

      console.log('User authenticated:', user.uid);
      let profilePhotoUrl = editPhoto;

      // Check if we need to upload a new image
      if (editPhoto && editPhoto !== profile?.profilePhotoUrl) {
        console.log('New image detected, starting upload process...');
        console.log('Image URI:', editPhoto);

        try {
          console.log('Using storage from config');

          console.log('Fetching image from URI...');
          console.log('Image URI type:', typeof editPhoto);
          console.log('Image URI starts with:', editPhoto?.substring(0, 20));

          const response = await fetch(editPhoto);
          console.log('Fetch response status:', response.status);
          console.log('Fetch response ok:', response.ok);
          console.log('Fetch response headers:', response.headers);

          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          console.log('Converting to blob...');
          const blob = await response.blob();
          console.log('Blob created, size:', blob.size, 'bytes');
          console.log('Blob type:', blob.type);

          const storageRef = ref(storage, `driverProfilePhotos/${user.uid}`);
          console.log('Storage reference created:', storageRef.fullPath);

          console.log('Uploading to Firebase Storage...');
          const uploadResult = await uploadBytes(storageRef, blob);
          console.log('Upload successful:', uploadResult);
          console.log('Uploaded bytes:', uploadResult.metadata.size);

          console.log('Getting download URL...');
          profilePhotoUrl = await getDownloadURL(storageRef);
          console.log('Download URL obtained:', profilePhotoUrl);

        } catch (uploadError: any) {
          console.error('Error during image upload:', uploadError);
          console.error('Upload error details:', {
            code: uploadError?.code,
            message: uploadError?.message,
            stack: uploadError?.stack
          });
          throw new Error(`Image upload failed: ${uploadError?.message || 'Unknown error'}`);
        }
      } else {
        console.log('No new image to upload, using existing photo URL');
      }

      console.log('Final profile photo URL:', profilePhotoUrl);

      // Save to Firestore
      if (profile && isValidProfile(profile)) {
        console.log('Updating existing profile...');
        const updateData = {
          name: editProfile.name,
          mobile: editProfile.mobile,
          license: editProfile.license,
          vehicle: editProfile.vehicle,
          profilePhotoUrl,
          vehicleType: editProfile.vehicleType,
          bikeModel: editProfile.bikeModel || '', // <-- Added
        };
        console.log('Update data:', updateData);

        await updateDoc(doc(db, 'drivers', user.uid), updateData);
        console.log('Profile updated successfully in Firestore');

        setProfile({ ...profile, ...editProfile, profilePhotoUrl } as DriverProfile);
        Toast.show('Profile updated!', { duration: Toast.durations.SHORT, backgroundColor: Colors.light.primary, textColor: Colors.light.background });
      } else {
        console.log('Creating new profile...');
        const createData = {
          name: editProfile.name,
          mobile: editProfile.mobile,
          license: editProfile.license,
          vehicle: editProfile.vehicle,
          profilePhotoUrl,
          vehicleType: editProfile.vehicleType,
          bikeModel: editProfile.bikeModel || '', // <-- Added
          createdAt: new Date(),
        };
        console.log('Create data:', createData);

        await setDoc(doc(db, 'drivers', user.uid), createData);
        console.log('Profile created successfully in Firestore');

        setProfile({ ...editProfile, profilePhotoUrl } as DriverProfile);
        Toast.show('Profile created!', { duration: Toast.durations.SHORT, backgroundColor: Colors.light.primary, textColor: Colors.light.background });
      }

      // Navigate back to Home tab if we're on Profile tab
      if (route?.params?.showProfile) {
        console.log('Navigating back to DriverHome...');
        setTimeout(() => {
          (navigation as any).navigate('DriverHome');
        }, 800);
      } else {
        console.log('Setting view to available...');
        setTimeout(() => setView('available'), 800);
      }

      console.log('=== Profile save process completed successfully ===');

    } catch (e: any) {
      console.error('=== Error in profile save process ===');
      console.error('Error details:', {
        message: e?.message,
        code: e?.code,
        stack: e?.stack
      });

      let errorMessage = 'Could not update profile.';
      if (e?.message) {
        errorMessage = `Error: ${e.message}`;
      }

      Toast.show(errorMessage, { duration: Toast.durations.SHORT, backgroundColor: '#e53935', textColor: Colors.light.background });
    } finally {
      setSavingProfile(false);
      console.log('Saving state set to false');
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    if (acceptingRide) return; // Prevent multiple clicks

    setAcceptingRide(rideId);
    try {
      console.log('Attempting to accept ride:', rideId);

      const user = auth.currentUser;
      if (!user) {
        console.log('No user found - user not logged in');
        Alert.alert('Error', 'You must be logged in as a driver.');
        return;
      }

      // Check if driver already has an active ride (excluding cancelled rides)
      const activeRidesQuery = query(
        collection(db, 'rides'),
        where('driverId', '==', user.uid),
        where('status', 'in', ['Driver on the way', 'Ride in progress'])
      );

      const activeRidesSnapshot = await getDocs(activeRidesQuery);
      if (!activeRidesSnapshot.empty) {
        console.log('Driver already has an active ride');
        Alert.alert('Error', 'You already have an active ride. Please complete or cancel your current ride before accepting a new one.');
        return;
      }

      console.log('User authenticated:', user.uid);
      console.log('Updating ride document:', rideId);

      // First, let's check if the ride exists and is available
      const rideDoc = await getDoc(doc(db, 'rides', rideId));
      if (!rideDoc.exists()) {
        console.log('Ride document does not exist');
        Alert.alert('Error', 'Ride not found. It may have been cancelled.');
        return;
      }

      const rideData = rideDoc.data();
      console.log('Current ride data:', rideData);

      if (rideData.status !== 'booked') {
        console.log('Ride status is not booked:', rideData.status);
        Alert.alert('Error', 'This ride is no longer available.');
        return;
      }

      if (rideData.driverId) {
        console.log('Ride already has a driver:', rideData.driverId);
        Alert.alert('Error', 'This ride has already been accepted by another driver.');
        return;
      }

      // Update the ride
      await updateDoc(doc(db, 'rides', rideId), {
        driverId: user.uid,
        status: 'Driver on the way',
        acceptedAt: new Date(),
      });

      console.log('Ride accepted successfully');
      Alert.alert('Success', 'Ride accepted!');
      (navigation as any).navigate('DriverRideStatus', { rideId });
    } catch (e: any) {
      console.error('Error accepting ride:', e);
      console.error('Error details:', {
        code: e?.code,
        message: e?.message,
        stack: e?.stack
      });

      let errorMessage = 'Could not accept ride.';
      if (e?.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have access to update this ride.';
      } else if (e?.code === 'not-found') {
        errorMessage = 'Ride not found. It may have been deleted.';
      } else if (e?.code === 'unavailable') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (e?.code === 'already-exists') {
        errorMessage = 'This ride has already been accepted.';
      } else if (e?.message) {
        errorMessage = `Error: ${e.message}`;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setAcceptingRide(null);
    }
  };

  const handleRejectRide = async (rideId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'You must be logged in as a driver.');
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Reject Ride',
        'Are you sure you want to reject this ride?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              try {
                await updateDoc(doc(db, 'rides', rideId), {
                  rejectedBy: user.uid,
                  rejectedAt: new Date(),
                  status: 'rejected',
                });
                Alert.alert('Success', 'Ride rejected successfully!');
              } catch (error) {
                Alert.alert('Error', 'Could not reject ride.');
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not reject ride.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // No manual navigation; App.tsx will handle redirect
    } catch (e) {
      Alert.alert('Error', 'Could not log out.');
    }
  };

  // Add this helper to check verification
  const isVerified = profile?.verificationStatus === 'verified';
  const isPending = profile?.verificationStatus === 'pending';
  const isRejected = profile?.verificationStatus === 'rejected';

  // Redirect to verification screen if not verified
  React.useEffect(() => {
    if (profile && !isVerified && view !== 'profile') {
      // Only redirect if not already on verification screen
      if (propNavigation && propNavigation.navigate) {
        propNavigation.navigate('DriverVerification');
      }
    }
  }, [profile, isVerified, view]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.light.surface, paddingHorizontal: 18, paddingTop: 8 }}>
      {/* Block access if not verified and not on profile/verification */}
      {profile && !isVerified && view !== 'profile' && (
        isPending ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 20, color: Colors.light.primary, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>
              Documents under review
            </Text>
            <Text style={{ fontSize: 15, color: Colors.light.secondary, textAlign: 'center', marginBottom: 24 }}>
              Your documents have been submitted and are currently under review. You will be notified once your account is verified or if any issues are found.
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 20, color: Colors.light.primary, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>
              Your account is not verified
            </Text>
            <Text style={{ fontSize: 15, color: Colors.light.secondary, textAlign: 'center', marginBottom: 24 }}>
              Please upload your documents for verification to unlock all features.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: Colors.light.primary, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 32 }}
              onPress={() => propNavigation.navigate('DriverVerification')}
            >
              <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 16 }}>Go to Verification</Text>
            </TouchableOpacity>
          </View>
        )
      )}
     
      {view === 'profile' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 40, paddingHorizontal: 0, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%', maxWidth: 400, alignItems: 'center', padding: 36, backgroundColor: Colors.light.card, borderRadius: 32, shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 12, marginBottom: 18 }}>
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: Colors.light.secondary, marginBottom: 8, textAlign: 'center', letterSpacing: 1, fontFamily: 'Inter' }}>
              {profile && isValidProfile(profile) ? 'Edit Profile' : 'Add Profile Details'}
            </Text>
            <Text style={{ fontSize: 16, color: Colors.light.secondary, marginBottom: 24, textAlign: 'center', fontWeight: '600', fontFamily: 'Inter' }}>
              {profile && isValidProfile(profile) ? 'Update your details' : 'Add your details to start accepting rides'}
            </Text>
            {editProfile && (
              <>
                <TouchableOpacity style={{ marginBottom: 24 }} onPress={pickEditProfilePhoto} activeOpacity={0.85}>
                  {editPhoto ? (
                    <Image source={{ uri: editPhoto }} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: Colors.light.primary, marginBottom: 8 }} />
                  ) : (
                    <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.light.background, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      <MaterialCommunityIcons name="account" size={48} color={Colors.light.primary} />
                    </View>
                  )}
                  <Text style={{ fontSize: 15, fontWeight: 'bold', textAlign: 'center', color: Colors.light.primary, fontFamily: 'Inter' }}>Change Photo</Text>
                </TouchableOpacity>
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Full Name</Text>
                  <TextInput
                    value={editProfile.name}
                    onChangeText={v => {
                      setEditProfile({ ...editProfile, name: v });
                      setProfileErrors({ ...profileErrors, name: v ? '' : 'Name is required' });
                    }}
                    style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.light.secondary + '99'}
                  />
                  {profileErrors.name ? <Text style={{ color: '#e53935', marginBottom: 2 }}>{profileErrors.name}</Text> : null}
                </View>
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Mobile Number</Text>
                  <TextInput
                    value={editProfile.mobile}
                    onChangeText={v => {
                      setEditProfile({ ...editProfile, mobile: v });
                      setProfileErrors({ ...profileErrors, mobile: /^\d{10}$/.test(v) ? '' : 'Enter a valid 10-digit mobile number' });
                    }}
                    style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                    placeholder="Mobile Number"
                    placeholderTextColor={Colors.light.secondary + '99'}
                    keyboardType="phone-pad"
                  />
                  {profileErrors.mobile ? <Text style={{ color: '#e53935', marginBottom: 2 }}>{profileErrors.mobile}</Text> : null}
                </View>
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Driving License Number</Text>
                  <TextInput
                    value={editProfile.license}
                    onChangeText={v => {
                      setEditProfile({ ...editProfile, license: v });
                      setProfileErrors({ ...profileErrors, license: v.length >= 5 ? '' : 'Enter a valid license number' });
                    }}
                    style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                    placeholder="License Number"
                    placeholderTextColor={Colors.light.secondary + '99'}
                  />
                  {profileErrors.license ? <Text style={{ color: '#e53935', marginBottom: 2 }}>{profileErrors.license}</Text> : null}
                </View>
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Vehicle Number</Text>
                  <TextInput
                    value={editProfile.vehicle}
                    onChangeText={v => {
                      setEditProfile({ ...editProfile, vehicle: v });
                      setProfileErrors({ ...profileErrors, vehicle: v ? '' : 'Vehicle number is required' });
                    }}
                    style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                    placeholder="Vehicle Number"
                    placeholderTextColor={Colors.light.secondary + '99'}
                  />
                  {profileErrors.vehicle ? <Text style={{ color: '#e53935', marginBottom: 2 }}>{profileErrors.vehicle}</Text> : null}
                </View>
                {editProfile?.vehicleType === 'bike' && (
                  <View style={{ width: '100%', marginBottom: 18 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Bike Model</Text>
                    <TextInput
                      value={editProfile.bikeModel || ''}
                      onChangeText={v => setEditProfile({ ...editProfile, bikeModel: v })}
                      style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                      placeholder="Bike Model"
                      placeholderTextColor={Colors.light.secondary + '99'}
                    />
                  </View>
                )}
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 6, color: Colors.light.secondary, fontFamily: 'Inter' }}>Vehicle Type</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                    <TouchableOpacity
                      style={{ flex: 1, padding: 14, borderRadius: 12, marginRight: 8, backgroundColor: editProfile.vehicleType === 'auto' ? Colors.light.primary : Colors.light.surface, alignItems: 'center' }}
                      onPress={() => setEditProfile({ ...editProfile, vehicleType: 'auto' })}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: editProfile.vehicleType === 'auto' ? Colors.light.surface : Colors.light.primary, fontWeight: 'bold', fontFamily: 'Inter' }}>Auto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, padding: 14, borderRadius: 12, marginLeft: 8, backgroundColor: editProfile.vehicleType === 'bike' ? Colors.light.primary : Colors.light.surface, alignItems: 'center' }}
                      onPress={() => setEditProfile({ ...editProfile, vehicleType: 'bike' })}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: editProfile.vehicleType === 'bike' ? Colors.light.surface : Colors.light.primary, fontWeight: 'bold', fontFamily: 'Inter' }}>Bike</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {editProfile?.vehicleType === 'bike' && (
                  <View style={{ width: '100%', marginBottom: 18 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Bike Model</Text>
                    <TextInput
                      value={editProfile.bikeModel || ''}
                      onChangeText={v => setEditProfile({ ...editProfile, bikeModel: v })}
                      style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                      placeholder="Bike Model"
                      placeholderTextColor={Colors.light.secondary + '99'}
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={{ backgroundColor: Colors.light.primary, borderRadius: 999, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 2, marginTop: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 }}
                  onPress={handleSaveProfile}
                  disabled={savingProfile || !isValidProfile(editProfile)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: Colors.light.surface, fontSize: 17, fontWeight: 'bold', fontFamily: 'Inter' }}>
                    {savingProfile ? 'Saving...' : (profile && isValidProfile(profile) ? 'Update Profile' : 'Create Profile')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingBottom: 40, paddingHorizontal: 4 }}>
            {/* Greeting Message */}
            {(() => {
              const now = new Date();
              const hour = now.getHours();
              let greeting = 'Good morning,';
              if (hour >= 12 && hour < 17) greeting = 'Good afternoon,';
              else if (hour >= 17 || hour < 4) greeting = 'Good evening,';
              return (
                <Text style={{ fontSize: 30, color: Colors.light.primary, marginBottom: 16, fontFamily: 'Inter', textAlign: 'center', fontWeight: 'bold' }}>{greeting}</Text>
              );
            })()}
          {checkingActiveRide && (
            <View style={{
              backgroundColor: Colors.light.primary + '15',
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              borderLeftWidth: 4,
              borderLeftColor: Colors.light.primary,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <ActivityIndicator size="small" color={Colors.light.primary} style={{ marginRight: 12 }} />
              <Text style={{
                fontSize: 14,
                color: Colors.light.primary,
                fontWeight: '600',
                fontFamily: 'Inter',
                flex: 1
              }}>
                Checking for active rides...
              </Text>
            </View>
          )}
          

          {/* Profile Card */}
          <View
            style={{ padding: 20, backgroundColor: Colors.light.card, borderRadius: 28, alignItems: 'center', marginBottom: 24, shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}
          >
           
            {/* Earnings and Ride Count Summary */}
            {historyLoading ? (
              <ActivityIndicator size="large" color={Colors.light.primary} />
            ) : (
              (() => {
                // Calculate total and today's earnings
                const totalEarnings = history.reduce((sum, ride) => sum + (ride.fare || 0), 0);
                const today = new Date();
                const todayEarnings = history.reduce((sum, ride) => {
                  if (ride.createdAt && ride.createdAt.toDate) {
                    const rideDate = ride.createdAt.toDate();
                    if (
                      rideDate.getFullYear() === today.getFullYear() &&
                      rideDate.getMonth() === today.getMonth() &&
                      rideDate.getDate() === today.getDate()
                    ) {
                      return sum + (ride.fare || 0);
                    }
                  }
                  return sum;
                }, 0);
                const completedCount = history.length;
                return (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, fontFamily: 'Inter', marginBottom: 12 }}>Your Earnings</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 10 }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Inter', marginBottom: 5, marginTop:5 }}>Total</Text>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: Colors.light.primary, fontFamily: 'Inter' }}>₹{totalEarnings}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Inter', marginBottom: 5, marginTop: 5 }}>Today</Text>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: Colors.light.primary, fontFamily: 'Inter' }}>₹{todayEarnings}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Inter', marginBottom: 5, marginTop:5 }}>Completed</Text>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: Colors.light.primary, fontFamily: 'Inter' }}>{completedCount}</Text>
                      </View>
                    </View>
                  </>
                );
              })()
            )}
          </View>
          {/* Navigation Tabs */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 }}>
            <TouchableOpacity onPress={() => setView('available')} style={{ flex: 1, paddingVertical: 16, borderRadius: 14, marginRight: 6, backgroundColor: view === 'available' ? Colors.light.primary : Colors.light.surface, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: view === 'available' ? 0.10 : 0, shadowRadius: 6, elevation: view === 'available' ? 2 : 0 }}>
              <Text style={{ fontWeight: 'bold', color: view === 'available' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Inter' }}>Available</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('history')} style={{ flex: 1, paddingVertical: 16, borderRadius: 14, marginHorizontal: 3, backgroundColor: view === 'history' ? Colors.light.primary : Colors.light.surface, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: view === 'history' ? 0.10 : 0, shadowRadius: 6, elevation: view === 'history' ? 2 : 0 }}>
              <Text style={{ fontWeight: 'bold', color: view === 'history' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Inter' }}>Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('all')} style={{ flex: 1, paddingVertical: 16, borderRadius: 14, marginLeft: 6, backgroundColor: view === 'all' ? Colors.light.primary : Colors.light.surface, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: view === 'all' ? 0.10 : 0, shadowRadius: 6, elevation: view === 'all' ? 2 : 0 }}>
              <Text style={{ fontWeight: 'bold', color: view === 'all' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Inter' }}>All Rides</Text>
            </TouchableOpacity>
          </View>
          {/* Main Content */}
          {view === 'available' && (
            <>
              {locationError && (
                <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 14, fontFamily: 'Inter' }}>{locationError}</Text>
              )}
              {checkingActiveRide ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={Colors.light.primary} />
                  <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Inter' }}>
                    Checking for active rides...
                  </Text>
                </View>
              ) : (!profile || !profile.vehicleType) ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <MaterialCommunityIcons name="car" size={64} color={Colors.light.secondary + '40'} />
                  <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Inter' }}>
                    Complete your profile first
                  </Text>
                  <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Inter' }}>
                    Set your vehicle type to see available rides
                  </Text>
                  <TouchableOpacity
                    style={{ marginTop: 16, backgroundColor: Colors.light.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20 }}
                    onPress={() => setView('profile')}
                  >
                    <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontFamily: 'Inter' }}>Go to Profile</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {loading ? (
                    <ActivityIndicator size="large" color={Colors.light.primary} />
                  ) : error ? (
                    <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 14, fontFamily: 'Inter' }}>{error}</Text>
                  ) : (
                    <FlatList
                      data={rides}
                      keyExtractor={item => item.id}
                      renderItem={({ item }) => (
                        <View style={{ padding: 22, backgroundColor: Colors.light.surface, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                          <Text style={{ fontSize: 16, color: Colors.light.secondary, fontWeight: '600', marginBottom: 4, fontFamily: 'Inter' }}>Fare: <Text style={{ color: Colors.light.primary }}>₹{item.fare}</Text></Text>
                          <Text style={{ fontSize: 15, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Inter' }}>Pickup: {pickupAddresses[item.id] || 'Loading...'}</Text>
                          <Text style={{ fontSize: 15, color: Colors.light.secondary, marginBottom: 10, fontFamily: 'Inter' }}>Drop-off: {dropoffAddresses[item.id] || 'Loading...'}</Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                paddingVertical: 12,
                                backgroundColor: acceptingRide === item.id ? Colors.light.secondary : Colors.light.primary,
                                borderRadius: 12,
                                alignItems: 'center',
                                marginRight: 8,
                                shadowColor: Colors.light.primary,
                                shadowOpacity: 0.2,
                                shadowRadius: 4,
                                elevation: 2,
                                flexDirection: 'row',
                                justifyContent: 'center'
                              }}
                              onPress={() => handleAcceptRide(item.id)}
                              disabled={acceptingRide === item.id}
                            >
                              {acceptingRide === item.id ? (
                                <ActivityIndicator size="small" color={Colors.light.surface} style={{ marginRight: 4 }} />
                              ) : (
                                <MaterialCommunityIcons name="check" size={16} color={Colors.light.surface} style={{ marginRight: 4 }} />
                              )}
                              <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.light.surface, fontFamily: 'Inter' }}>
                                {acceptingRide === item.id ? 'Accepting...' : 'Accept'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                paddingVertical: 12,
                                backgroundColor: '#FF3B30',
                                borderRadius: 12,
                                alignItems: 'center',
                                marginLeft: 8,
                                shadowColor: '#FF3B30',
                                shadowOpacity: 0.2,
                                shadowRadius: 4,
                                elevation: 2,
                                flexDirection: 'row',
                                justifyContent: 'center'
                              }}
                              onPress={() => handleRejectRide(item.id)}
                            >
                              <MaterialCommunityIcons name="close" size={16} color={Colors.light.surface} style={{ marginRight: 4 }} />
                              <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.light.surface, fontFamily: 'Inter' }}>Reject</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      ListEmptyComponent={<Text style={{ fontSize: 15, color: Colors.light.secondary, textAlign: 'center', fontFamily: 'Inter' }}>No available rides.</Text>}
                    />
                  )}
                </>
              )}
            </>
          )}
          {view === 'history' && (
            <>
              {/* <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, marginBottom: 14, fontFamily: 'Inter' }}>Completed Rides</Text> */}
              {historyLoading ? (
                <ActivityIndicator size="large" color={Colors.light.primary} />
              ) : (
                <FlatList
                  data={history}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => (
                    <View style={{ padding: 22, backgroundColor: Colors.light.card, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontSize: 18, color: Colors.light.secondary, fontWeight: 'bold', fontFamily: 'Inter' }}>
                          ₹{item.fare}
                        </Text>
                        <View style={{
                          backgroundColor: '#34C759',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 12
                        }}>
                          <Text style={{ fontSize: 12, color: Colors.light.surface, fontWeight: '600', fontFamily: 'Inter' }}>
                            Completed
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <MaterialCommunityIcons name="map-marker" size={16} color={Colors.light.primary} />
                          <Text style={{ fontSize: 14, color: Colors.light.secondary, marginLeft: 6, fontFamily: 'Inter' }}>
                            {historyPickupAddresses[item.id] || 'Loading...'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <MaterialCommunityIcons name="flag-checkered" size={16} color="#34C759" />
                          <Text style={{ fontSize: 14, color: Colors.light.secondary, marginLeft: 6, fontFamily: 'Inter' }}>
                            {historyDropoffAddresses[item.id] || 'Loading...'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: Colors.light.secondary + 'CC', fontFamily: 'Inter' }}>
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </Text>
                        {item.paymentMethod && (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons
                              name={item.paymentMethod === 'cash' ? 'cash' : 'credit-card'}
                              size={14}
                              color={Colors.light.secondary}
                            />
                            <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 4, fontFamily: 'Inter' }}>
                              {item.paymentMethod === 'cash' ? 'Cash' : 'Online'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <MaterialCommunityIcons name="history" size={64} color={Colors.light.secondary + '40'} />
                      <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Inter' }}>
                        No completed rides yet
                      </Text>
                      <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Inter' }}>
                        Your completed rides will appear here
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          )}
          {view === 'all' && (
            <>
              {allRidesLoading ? (
                <ActivityIndicator size="large" color={Colors.light.primary} />
              ) : (
                <FlatList
                  data={allRides}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => (
                    <View style={{ padding: 22, backgroundColor: Colors.light.surface, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontSize: 18, color: Colors.light.secondary, fontWeight: 'bold', fontFamily: 'Inter' }}>
                          ₹{item.fare}
                        </Text>
                        <View style={{
                          backgroundColor: item.status === 'Completed' ? '#34C759' :
                            item.status === 'Ride in progress' ? '#FF9500' :
                              item.status === 'Driver on the way' ? Colors.light.primary : '#999',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 12
                        }}>
                          <Text style={{ fontSize: 12, color: Colors.light.surface, fontWeight: '600', fontFamily: 'Inter' }}>
                            {item.status || 'Unknown'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 14, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Inter' }}>
                          <Text style={{ fontWeight: '600' }}>Pickup:</Text> {item.pickup ? `${item.pickup.latitude.toFixed(5)}, ${item.pickup.longitude.toFixed(5)}` : 'N/A'}
                        </Text>
                        <Text style={{ fontSize: 14, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Inter' }}>
                          <Text style={{ fontWeight: '600' }}>Dropoff:</Text> {item.dropoff ? `${item.dropoff.latitude.toFixed(5)}, ${item.dropoff.longitude.toFixed(5)}` : 'N/A'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: Colors.light.secondary + 'CC', fontFamily: 'Inter' }}>
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </Text>
                        {item.paymentMethod && (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons
                              name={item.paymentMethod === 'cash' ? 'cash' : 'credit-card'}
                              size={14}
                              color={Colors.light.secondary}
                            />
                            <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 4, fontFamily: 'Inter' }}>
                              {item.paymentMethod === 'cash' ? 'Cash' : 'Online'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <MaterialCommunityIcons name="car" size={64} color={Colors.light.secondary + '40'} />
                      <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Inter' }}>
                        No rides found
                      </Text>
                      <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Inter' }}>
                        You haven&apos;t accepted any rides yet
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
} 