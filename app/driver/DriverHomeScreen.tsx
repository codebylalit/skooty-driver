// @ts-ignore
import { getFirebaseAuth, db as rawDb, storage as rawStorage } from '../../firebaseConfig';
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
  Keyboard,
  Pressable,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-root-toast';
// @ts-ignore
import * as Notifications from 'expo-notifications';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { getCommissionSummary } from '../../commissionUtils';
import { Colors } from '../../constants/Colors';

// @ts-ignore
const auth = getFirebaseAuth();
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

function useRegisterPushToken() {
  React.useEffect(() => {
    let savedToken = '';
    async function registerForPushNotificationsAsync() {
      let token;
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          return;
        }
        token = (await Notifications.getExpoPushTokenAsync()).data;
        // Save token to Firestore if changed
        const user = auth.currentUser;
        if (user && token && token !== savedToken) {
          try {
            await updateDoc(doc(db, 'drivers', user.uid), { expoPushToken: token });
            savedToken = token;
          } catch (e) {
            // ignore
          }
        }
      }
    }
    registerForPushNotificationsAsync();
  }, []);
}

export default function DriverHomeScreen({ navigation: propNavigation, route }: { navigation: any, route: any }) {
  // useRegisterPushToken();
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
  const [pendingCommission, setPendingCommission] = useState(0);
  const [commissionLoading, setCommissionLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [platformFeeDue, setPlatformFeeDue] = useState(0);
  const [totalPlatformPaid, setTotalPlatformPaid] = useState(0);
  // Move useRef here (top-level, only once)
  const prevRideIdsRef = React.useRef<Set<string>>(new Set());


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

  // Real-time listener for completed rides (history)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const user = auth.currentUser;
    if (user) {
      const q = query(
        collection(db, 'rides'),
        where('driverId', '==', user.uid),
        where('status', '==', 'Completed')
      );
      unsubscribe = onSnapshot(q, (querySnapshot) => {
        const completedRides = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, ...data } as Ride;
        });
        setHistory(completedRides);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [auth.currentUser]);

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

      //     // Check if driver already has an active ride
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

        //       // Continue with normal ride fetching if no active ride
        //       // Update query to include both 'booked' and 'pending' status rides
        //       // AND filter by vehicle type
        const q = query(
          collection(db, 'rides'),
          where('status', 'in', ['booked', 'pending']),
          where('driverId', '==', null),
          where('vehicleType', '==', profile?.vehicleType)
        );

        console.log('Query set up for vehicle type:', profile?.vehicleType);

        unsubscribe = onSnapshot(q, async (querySnapshot) => {
          let data = querySnapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
          console.log('Available rides found:', data.length);
          data.forEach(ride => {
            console.log('Ride:', { id: ride.id, status: ride.status, driverId: ride.driverId, fare: ride.fare, vehicleType: ride.vehicleType });
          });

          //         // --- AUTO-REJECT LOGIC START ---
          const now = Date.now();
          const TWO_MINUTES = 2 * 60 * 1000;
          await Promise.all(
            data.map(async (ride) => {
              if (
                (ride.status === 'booked' || ride.status === 'pending') &&
                !ride.driverId &&
                ride.createdAt &&
                ((ride.createdAt.toDate ? ride.createdAt.toDate().getTime() : new Date(ride.createdAt).getTime()) < now - TWO_MINUTES)
              ) {
                try {
                  await updateDoc(doc(db, 'rides', ride.id), {
                    status: 'rejected',
                    rejectedAt: new Date(),
                    rejectedReason: 'Auto-rejected: not accepted within 2 minutes',
                  });
                } catch (e) {
                  // Optionally log error
                  console.error('Auto-reject failed for ride', ride.id, e);
                }
              }
            })
          );
          //         // --- AUTO-REJECT LOGIC END ---

          //         // --- NEW RIDE NOTIFICATION LOGIC START ---
          const prevRideIds = prevRideIdsRef.current;
          const currentRideIds = new Set(data.map(ride => ride.id));
          let newRideDetected = false;
          for (const id of currentRideIds) {
            if (!prevRideIds.has(id)) {
              newRideDetected = true;
              break;
            }
          }
          if (newRideDetected && prevRideIds.size > 0) {
            Toast.show('New ride request received!', {
              duration: Toast.durations.SHORT,
              backgroundColor: Colors.light.primary,
              textColor: Colors.light.background,
            });
          }
          prevRideIdsRef.current = currentRideIds;
          //         // --- NEW RIDE NOTIFICATION LOGIC END ---

          //         // Filter by proximity if location is available (increased radius to 10km)
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
      // (Removed one-time fetch for completed rides, now handled by real-time listener)
      setHistoryLoading(false);
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

  // // Fetch addresses for available rides
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

  // // Fetch addresses for completed rides
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

      //     // Save to Firestore
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

      //     // First, let's check if the ride exists and is available
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

      //     // Update the ride
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

  // // Add this helper to check verification
  const isVerified = profile?.verificationStatus === 'verified';
  const isPending = profile?.verificationStatus === 'pending';
  const isRejected = profile?.verificationStatus === 'rejected';

  useEffect(() => {
    async function checkCommission() {
      const data = await getCommissionSummary(auth.currentUser?.uid);
      if (data?.pendingCommission > 500) {
        Alert.alert(
          'Commission Due',
          'You have unpaid commission over ₹500. Please pay to continue.'
        );
        // Optionally, set a state to disable online toggle here
        // setOnlineBlocked(true);
      } else {
        // setOnlineBlocked(false);
      }
    }
    checkCommission();
  }, []);

  // // Replace the old fetchCommission useEffect with a real-time listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const driverRef = doc(db, 'drivers', user.uid);
    setCommissionLoading(true);
    const unsubscribe = onSnapshot(driverRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPendingCommission(data.pendingCommission || 0);
        setTotalEarnings(data.totalEarnings || 0);
        setPlatformFeeDue(data.commissionDue || 0);
        setTotalPlatformPaid(data.totalCommissionPaid || 0);
      }
      setCommissionLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.light.surface, paddingHorizontal: 18, paddingTop: 8 }}>
      {/* Show only profile content if on profile view */}
      {view === 'profile' ? (
        (() => {
          propNavigation.navigate('DriverProfileScreen');
          return null;
        })()
      ) : (
        // Only show main content and tabs if not on profile view
        <>
          {/* Greeting message: show for all tabs except profile */}
          {(() => {
            const now = new Date();
            const hour = now.getHours();
            let greeting = 'Good morning,';
            if (hour >= 12 && hour < 17) greeting = 'Good afternoon,';
            else if (hour >= 17 || hour < 4) greeting = 'Good evening,';
            return (
              <Text style={{ fontSize: 30, color: Colors.light.primary, marginBottom: 4, marginTop: 8, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{greeting}</Text>
            );
          })()}
          {/* Earnings summary card: show for all tabs except profile */}
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
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, fontFamily: 'Poppins-Medium', marginBottom: 12 }}>Your Earnings</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 10 }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Poppins-Medium', marginBottom: 2, marginTop: 5 }}>Total</Text>
                        <Text style={{ fontSize: 20, color: Colors.light.primary, fontFamily: 'Poppins-SemiBold' }}>₹{totalEarnings}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Poppins-Medium', marginBottom: 2, marginTop: 5 }}>Today</Text>
                        <Text style={{ fontSize: 20, color: Colors.light.primary, fontFamily: 'Poppins-SemiBold' }}>₹{todayEarnings}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontFamily: 'Poppins-Medium', marginBottom: 2, marginTop: 5 }}>Rides</Text>
                        <Text style={{ fontSize: 20, color: Colors.light.primary, fontFamily: 'Poppins-SemiBold' }}>{completedCount}</Text>
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
              <Text style={{ fontWeight: 'bold', color: view === 'available' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Poppins-Medium' }}>Available</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('history')} style={{ flex: 1, paddingVertical: 16, borderRadius: 14, marginHorizontal: 3, backgroundColor: view === 'history' ? Colors.light.primary : Colors.light.surface, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: view === 'history' ? 0.10 : 0, shadowRadius: 6, elevation: view === 'history' ? 2 : 0 }}>
              <Text style={{ fontWeight: 'bold', color: view === 'history' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Poppins-Medium' }}>Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('all')} style={{ flex: 1, paddingVertical: 16, borderRadius: 14, marginLeft: 6, backgroundColor: view === 'all' ? Colors.light.primary : Colors.light.surface, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: view === 'all' ? 0.10 : 0, shadowRadius: 6, elevation: view === 'all' ? 2 : 0 }}>
              <Text style={{ fontWeight: 'bold', color: view === 'all' ? Colors.light.surface : Colors.light.primary, fontFamily: 'Poppins-Medium' }}>All Rides</Text>
            </TouchableOpacity>
          </View>

          {commissionLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Medium' }}>
                Checking commission status...
              </Text>
            </View>
          ) : pendingCommission > 500 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <View style={{
                backgroundColor: Colors.light.card,
                borderRadius: 18,
                paddingVertical: 22,
                paddingHorizontal: 16,
                width: '90%',
                shadowColor: '#dc2626',
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 2,
                alignItems: 'center',
                marginBottom: 16
              }}>
                <MaterialCommunityIcons name="lock-alert" size={54} color="#dc2626" style={{ marginBottom: 14 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 16, color: '#dc2626', fontWeight: 'bold', textAlign: 'center', fontFamily: 'Poppins-Medium', marginRight: 5 }}>
                    Account Locked
                  </Text>
                  <Pressable
                    onPress={() => Alert.alert(
                      'Why is my account locked?',
                      'Skooty charges a 15% platform support fee to help maintain the app, provide support, and cover platform fees.'
                    )}
                    style={{}}
                  >
                    <MaterialCommunityIcons name="information-outline" size={18} color="#dc2626" />
                  </Pressable>
                </View>
                <Text style={{ fontSize: 13, color: '#b91c1c', textAlign: 'center', marginBottom: 18, fontFamily: 'Poppins-Medium', lineHeight: 18, paddingHorizontal: 4 }}>
                  Your pending platform support fee is above ₹500. Please pay to unlock ride access.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: Colors.light.primary,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 28,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    shadowColor: Colors.light.primary,
                    shadowOpacity: 0.12,
                    shadowRadius: 5,
                    elevation: 1
                  }}
                  onPress={() => propNavigation.navigate('CommissionSummary')}
                >
                  <MaterialCommunityIcons name="credit-card-check" size={16} color={Colors.light.surface} style={{ marginRight: 6 }} />
                  <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 14, fontFamily: 'Poppins-Medium' }}>Pay Platform Fee</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : isPending ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <MaterialCommunityIcons name="clock-alert" size={54} color="#f59e42" style={{ marginBottom: 14 }} />
              <Text style={{ fontSize: 16, color: '#f59e42', fontWeight: 'bold', textAlign: 'center', fontFamily: 'Poppins-Medium', marginBottom: 8 }}>
                Documents Under Review
              </Text>
              <Text style={{ fontSize: 13, color: '#b45309', textAlign: 'center', marginBottom: 18, fontFamily: 'Poppins-Medium', lineHeight: 18, paddingHorizontal: 4 }}>
                Your documents have been submitted and are currently under review. You will be notified once your account is verified.
              </Text>
            </View>
          ) : !isVerified ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <MaterialCommunityIcons name="lock-alert" size={54} color="#dc2626" style={{ marginBottom: 14 }} />
              <Text style={{ fontSize: 16, color: '#dc2626', fontWeight: 'bold', textAlign: 'center', fontFamily: 'Poppins-Medium', marginBottom: 8 }}>
                Account Not Verified
              </Text>
              <Text style={{ fontSize: 13, color: '#b91c1c', textAlign: 'center', marginBottom: 18, fontFamily: 'Poppins-Medium', lineHeight: 18, paddingHorizontal: 4 }}>
                Your account is not verified yet. Please complete your verification to access ride features.
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: Colors.light.primary,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 28,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  shadowColor: Colors.light.primary,
                  shadowOpacity: 0.12,
                  shadowRadius: 5,
                  elevation: 1
                }}
                onPress={() => propNavigation.navigate('DriverVerification')}
              >
                <MaterialCommunityIcons name="account-check" size={16} color={Colors.light.surface} style={{ marginRight: 6 }} />
                <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 14, fontFamily: 'Poppins-Medium' }}>Verify Now</Text>
              </TouchableOpacity>
            </View>
          ) : locationError ? (
            <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 14, fontFamily: 'Poppins-Medium' }}>{locationError}</Text>
          ) : checkingActiveRide ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Medium' }}>
                Checking for active rides...
              </Text>
            </View>
          ) : (
            <>
              {/* Tab content: show only the correct list for each tab */}
              {view === 'available' && (
                loading ? (
                  <ActivityIndicator size="large" color={Colors.light.primary} />
                ) : error ? (
                  <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 14, fontFamily: 'Poppins-Medium' }}>{error}</Text>
                ) : (!profile || !profile.vehicleType) ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <MaterialCommunityIcons name="car" size={64} color={Colors.light.secondary + '40'} />
                    <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Medium' }}>
                      Complete your profile first
                    </Text>
                    <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Poppins-Medium' }}>
                      Set your vehicle type to see available rides
                    </Text>
                    <TouchableOpacity
                      style={{ marginTop: 16, backgroundColor: Colors.light.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20 }}
                      onPress={() => setView('profile')}
                    >
                      <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontFamily: 'Poppins-Medium' }}>Go to Profile</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <FlatList
                    data={rides}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                      <View style={{ padding: 22, backgroundColor: Colors.light.surface, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, fontWeight: '600', marginBottom: 4, fontFamily: 'Poppins-Medium' }}>Fare: <Text style={{ color: Colors.light.primary }}>₹{item.fare}</Text></Text>
                        <Text style={{ fontSize: 15, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Poppins-Medium' }}>Pickup: {pickupAddresses[item.id] || 'Loading...'}</Text>
                        <Text style={{ fontSize: 15, color: Colors.light.secondary, marginBottom: 10, fontFamily: 'Poppins-Medium' }}>Drop-off: {dropoffAddresses[item.id] || 'Loading...'}</Text>
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
                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.light.surface, fontFamily: 'Poppins-Medium' }}>
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
                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.light.surface, fontFamily: 'Poppins-Medium' }}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    ListEmptyComponent={<Text style={{ fontSize: 15, color: Colors.light.secondary, textAlign: 'center', fontFamily: 'Poppins-Medium' }}>No available rides.</Text>}
                  />
                )
              )}
              {view === 'history' && (
                historyLoading ? (
                  <ActivityIndicator size="large" color={Colors.light.primary} />
                ) : (
                  <FlatList
                    data={history}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                      <View style={{ padding: 22, backgroundColor: Colors.light.card, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontSize: 18, color: Colors.light.secondary, fontWeight: 'bold', fontFamily: 'Poppins-Medium' }}>
                            ₹{item.fare}
                          </Text>
                          <View style={{
                            backgroundColor: '#34C759',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 12
                          }}>
                            <Text style={{ fontSize: 12, color: Colors.light.surface, fontWeight: '600', fontFamily: 'Poppins-Medium' }}>
                              Completed
                            </Text>
                          </View>
                        </View>

                        <View style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <MaterialCommunityIcons name="map-marker" size={16} color={Colors.light.primary} />
                            <Text style={{ fontSize: 14, color: Colors.light.secondary, marginLeft: 6, fontFamily: 'Poppins-Medium' }}>
                              {historyPickupAddresses[item.id] || 'Loading...'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <MaterialCommunityIcons name="flag-checkered" size={16} color="#34C759" />
                            <Text style={{ fontSize: 14, color: Colors.light.secondary, marginLeft: 6, fontFamily: 'Poppins-Medium' }}>
                              {historyDropoffAddresses[item.id] || 'Loading...'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: Colors.light.secondary + 'CC', fontFamily: 'Poppins-Medium' }}>
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}
                          </Text>
                          {item.paymentMethod && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <MaterialCommunityIcons
                                name={item.paymentMethod === 'cash' ? 'cash' : 'credit-card'}
                                size={14}
                                color={Colors.light.secondary}
                              />
                              <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 4, fontFamily: 'Poppins-Medium' }}>
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
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Medium' }}>
                          No completed rides yet
                        </Text>
                        <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Poppins-Medium' }}>
                          Your completed rides will appear here
                        </Text>
                      </View>
                    }
                  />
                )
              )}
              {view === 'all' && (
                allRidesLoading ? (
                  <ActivityIndicator size="large" color={Colors.light.primary} />
                ) : (
                  <FlatList
                    data={allRides}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                      <View style={{ padding: 22, backgroundColor: Colors.light.surface, borderRadius: 20, marginBottom: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontSize: 18, color: Colors.light.secondary, fontWeight: 'bold', fontFamily: 'Poppins-Medium' }}>
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
                            <Text style={{ fontSize: 12, color: Colors.light.surface, fontWeight: '600', fontFamily: 'Poppins-Medium' }}>
                              {item.status || 'Unknown'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 14, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Poppins-Medium' }}>
                            <Text style={{ fontWeight: '600' }}>Pickup:</Text> {item.pickup ? `${item.pickup.latitude.toFixed(5)}, ${item.pickup.longitude.toFixed(5)}` : 'N/A'}
                          </Text>
                          <Text style={{ fontSize: 14, color: Colors.light.secondary, marginBottom: 4, fontFamily: 'Poppins-Medium' }}>
                            <Text style={{ fontWeight: '600' }}>Dropoff:</Text> {item.dropoff ? `${item.dropoff.latitude.toFixed(5)}, ${item.dropoff.longitude.toFixed(5)}` : 'N/A'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: Colors.light.secondary + 'CC', fontFamily: 'Poppins-Medium' }}>
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}
                          </Text>
                          {item.paymentMethod && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <MaterialCommunityIcons
                                name={item.paymentMethod === 'cash' ? 'cash' : 'credit-card'}
                                size={14}
                                color={Colors.light.secondary}
                              />
                              <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 4, fontFamily: 'Poppins-Medium' }}>
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
                        <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginTop: 16, fontFamily: 'Poppins-Medium' }}>
                          No rides found
                        </Text>
                        <Text style={{ fontSize: 14, color: Colors.light.secondary + 'CC', textAlign: 'center', marginTop: 8, fontFamily: 'Poppins-Medium' }}>
                          You haven&apos;t accepted any rides yet
                        </Text>
                      </View>
                    }
                  />
                )
              )}
            </>
          )}
        </>
      )}
    </View>
  );
} 