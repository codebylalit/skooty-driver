import { useNavigation } from '@react-navigation/native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
// @ts-ignore
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// @ts-ignore
import * as Location from 'expo-location';
import { serverTimestamp } from 'firebase/firestore';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors } from '../../constants/Colors';
import { db } from '../../firebaseConfig';
import { onSnapshot } from 'firebase/firestore';
const STATUS_FLOW = [
  'Driver on the way',
  'Ride in progress',
  'Completed',
];

interface Ride {
  id: string;
  status: string;
  fare?: number;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  customerName?: string;
  customerPhone?: string;
}

export default function DriverRideStatusScreen({ route }: { route: { params: { rideId: string } } }) {
  const { rideId } = route.params;
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusIndex, setStatusIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [showPaymentSelection, setShowPaymentSelection] = useState(false);
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [isRouteVisible, setIsRouteVisible] = useState(false);
  const [rideCancelled, setRideCancelled] = useState(false);
  const navigation: any = useNavigation();

  // Animation state for bottom section expansion
  const bottomSectionHeight = useRef(new Animated.Value(0)).current; // 0 = 50%, 1 = 75%
  const [isBottomExpanded, setIsBottomExpanded] = useState(false);

  // Real-time ride status listener to detect cancellations
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rides', rideId), (docSnap) => {
      if (docSnap.exists()) {
        const rideData = { id: docSnap.id, ...docSnap.data() } as Ride;
        setRide(rideData);

        // Check if ride was cancelled by rider
        if (rideData.status === 'cancelled' && !rideCancelled) {
          setRideCancelled(true);
          Alert.alert(
            'Ride Cancelled',
            'The customer has cancelled this ride. You can now go back to the home screen.',
            [
              {
                text: 'OK',
                onPress: () => navigation.goBack(),
              },
            ]
          );
          return;
        }

        const idx = STATUS_FLOW.indexOf(docSnap.data().status);
        setStatusIndex(idx >= 0 ? idx : 0);
      }
    }, (error) => {
      console.error('Error listening to ride updates:', error);
    });

    return () => unsubscribe();
  }, [rideId, rideCancelled, navigation]);

  useEffect(() => {
    const fetchRide = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'rides', rideId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const rideData = { id: docSnap.id, ...docSnap.data() } as Ride;
          setRide(rideData);
          const idx = STATUS_FLOW.indexOf(docSnap.data().status);
          setStatusIndex(idx >= 0 ? idx : 0);

          // Get addresses
          if (rideData.pickup) {
            const pickupAddr = await getAddressFromCoords(rideData.pickup);
            setPickupAddress(pickupAddr);
          }
          if (rideData.dropoff) {
            const dropoffAddr = await getAddressFromCoords(rideData.dropoff);
            setDropoffAddress(dropoffAddr);
          }
        }
      } catch (e) {
        Alert.alert('Error', 'Could not fetch ride.');
      } finally {
        setLoading(false);
      }
    };
    fetchRide();
  }, [rideId]);

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      if ((statusIndex === STATUS_FLOW.length - 1 && paymentCollected) || ride?.status === 'cancelled' || rideCancelled) {
        return false; // Allow default back action
      } else {
        Alert.alert(
          'Cannot Go Back',
          'You cannot go back while the ride is in progress. Please complete or cancel the ride first.',
          [{ text: 'OK', style: 'default' }]
        );
        return true; // Prevent default back action
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [statusIndex, paymentCollected, ride?.status, rideCancelled]);

  useEffect(() => {
    const getDriverLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setDriverLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      } catch (e) {
        // Could not get driver location
      }
    };
    getDriverLocation();
  }, []);

  // Update route and map region when driver location or status changes
  useEffect(() => {
    updateRoute();
    calculateMapRegion();
  }, [driverLocation, statusIndex, ride]);

  // Update driver location periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setDriverLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      } catch (e) {
        // Could not get driver location
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const getAddressFromCoords = async (coords: { latitude: number; longitude: number }): Promise<string> => {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      if (results && results.length > 0) {
        const { street, city, name, district, region } = results[0];
        return [street || name, city || district || region].filter(Boolean).join(', ');
      }
    } catch (e) {
      // ignore
    }
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  };

  // Function to calculate route coordinates between two points
  const calculateRouteCoordinates = (start: { latitude: number; longitude: number }, end: { latitude: number; longitude: number }) => {
    const coordinates = [];
    const steps = 50; // Number of points to generate

    for (let i = 0; i <= steps; i++) {
      const fraction = i / steps;
      const latitude = start.latitude + (end.latitude - start.latitude) * fraction;
      const longitude = start.longitude + (end.longitude - start.longitude) * fraction;
      coordinates.push({ latitude, longitude });
    }

    return coordinates;
  };

  // Function to update map region to show all relevant points
  const calculateMapRegion = () => {
    if (!ride) return;

    const points = [];

    // Add driver location if available
    if (driverLocation) {
      points.push(driverLocation);
    }

    // Add pickup and dropoff locations
    if (ride.pickup) {
      points.push(ride.pickup);
    }
    if (ride.dropoff) {
      points.push(ride.dropoff);
    }

    if (points.length === 0) return;

    // Calculate bounds
    const latitudes = points.map(p => p.latitude);
    const longitudes = points.map(p => p.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const deltaLat = (maxLat - minLat) * 1.5; // Add some padding
    const deltaLng = (maxLng - minLng) * 1.5;

    setMapRegion({
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: Math.max(deltaLat, 0.01),
      longitudeDelta: Math.max(deltaLng, 0.01),
    });
  };

  // Function to update route based on current status
  const updateRoute = () => {
    if (!ride || !driverLocation) return;

    if (statusIndex === 0) {
      // Driver on the way - show route from driver to pickup
      if (ride.pickup) {
        const route = calculateRouteCoordinates(driverLocation, ride.pickup);
        setRouteCoordinates(route);
        setIsRouteVisible(true);
      }
    } else if (statusIndex === 1) {
      // Ride in progress - show route from pickup to dropoff
      if (ride.pickup && ride.dropoff) {
        const route = calculateRouteCoordinates(ride.pickup, ride.dropoff);
        setRouteCoordinates(route);
        setIsRouteVisible(true);
      }
    } else {
      // Completed - hide route
      setIsRouteVisible(false);
    }
  };

  // Function to animate bottom section expansion
  const animateBottomSection = (expand: boolean) => {
    const toValue = expand ? 1 : 0;
    setIsBottomExpanded(expand);

    Animated.timing(bottomSectionHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const advanceStatus = async () => {
    if (!ride) return;

    setUpdating(true);
    try {
      const newStatusIndex = statusIndex + 1;
      const newStatus = STATUS_FLOW[newStatusIndex];

      const rideRef = doc(db, 'rides', rideId);

      if (newStatus === 'Completed') {
        // When completing the ride, animate the bottom section expansion
        animateBottomSection(true);
        setStatusIndex(newStatusIndex);
        setShowPaymentSelection(true);
        setUpdating(false);
        return;
      }

      await updateDoc(rideRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      setRide(prev => prev ? { ...prev, status: newStatus } : null);
      setStatusIndex(newStatusIndex);

    } catch (e) {
      Alert.alert('Error', 'Could not update ride status.');
    } finally {
      setUpdating(false);
    }
  };

  const completeRideWithPayment = async () => {
    if (!ride) return;

    setUpdating(true);
    try {
      const rideRef = doc(db, 'rides', rideId);

      await updateDoc(rideRef, {
        status: 'Completed',
        paymentMethod: paymentMethod,
        paymentCollected: true,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRide(prev => prev ? { ...prev, status: 'Completed', paymentMethod } : null);
      setStatusIndex(STATUS_FLOW.length - 1);
      setPaymentCollected(true);
      setShowPaymentSelection(false);

      // Reset animation after a short delay to show completion state
      setTimeout(() => {
        animateBottomSection(true);
      }, 100000);

    } catch (e) {
      Alert.alert('Error', 'Could not complete ride.');
    } finally {
      setUpdating(false);
    }
  };

  const cancelRide = async () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride? This action cannot be undone.',
      [
        {
          text: 'No, Continue',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              const rideRef = doc(db, 'rides', rideId);

              await updateDoc(rideRef, {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              setRide(prev => prev ? { ...prev, status: 'cancelled' } : null);
              setStatusIndex(STATUS_FLOW.length - 1);

              Alert.alert(
                'Ride Cancelled',
                'The ride has been cancelled. You can now go back to the home screen.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );

            } catch (e) {
              Alert.alert('Error', 'Could not cancel ride.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Driver on the way': return Colors.light.primary;
      case 'Ride in progress': return '#FF9500';
      case 'Completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      default: return Colors.light.primary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Driver on the way': return 'car';
      case 'Ride in progress': return 'map-marker-path';
      case 'Completed': return 'check-circle';
      case 'cancelled': return 'close-circle';
      default: return 'car';
    }
  };

  const Card = ({ icon, iconColor, iconBg, title, value }: any) => (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.light.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOpacity: 0.02,
      shadowRadius: 2,
      elevation: 1,
      borderWidth: 0.5,
      borderColor: Colors.light.background,
      minHeight: 48,
    }}>
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: iconBg,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
      }}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 13,
          fontWeight: '600',
          color: Colors.light.secondary,
          fontFamily: 'Inter',
          marginBottom: 2,
        }}>
          {title}
        </Text>
        <Text style={{
          fontSize: 14,
          color: Colors.light.secondary,
          fontFamily: 'Inter',
          lineHeight: 18,
        }}>
          {value}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.surface }}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.surface }}>
        <Text style={{ fontSize: 16, color: Colors.light.secondary }}>No ride found.</Text>
      </View>
    );
  }

  // Show cancelled ride state
  if (ride.status === 'cancelled' || rideCancelled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.light.surface }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{
            backgroundColor: '#FF3B30' + '20',
            borderRadius: 50,
            padding: 20,
            marginBottom: 20
          }}>
            <MaterialCommunityIcons name="close-circle" size={48} color="#FF3B30" />
          </View>
          <Text style={{
            fontSize: 24,
            fontWeight: '700',
            color: Colors.light.secondary,
            marginBottom: 12,
            fontFamily: 'Inter',
            textAlign: 'center'
          }}>
            Ride Cancelled
          </Text>
          <Text style={{
            fontSize: 16,
            color: Colors.light.secondary + 'CC',
            marginBottom: 30,
            fontFamily: 'Inter',
            textAlign: 'center',
            lineHeight: 22
          }}>
            This ride has been cancelled by the customer.
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: Colors.light.primary,
              borderRadius: 12,
              paddingHorizontal: 32,
              paddingVertical: 16,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: Colors.light.primary,
              shadowOpacity: 0.2,
              shadowRadius: 12,
              elevation: 6,
            }}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons
              name="home"
              size={20}
              color={Colors.light.surface}
              style={{ marginRight: 10 }}
            />
            <Text style={{
              color: Colors.light.surface,
              fontSize: 16,
              fontWeight: '700',
              fontFamily: 'Inter',
              letterSpacing: 0.2
            }}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.light.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 28, backgroundColor: Colors.light.surface }}>
        <TouchableOpacity
          style={{
            padding: 4,
            borderRadius: 12,
            backgroundColor: Colors.light.background,
            opacity: (statusIndex === STATUS_FLOW.length - 1 && paymentCollected) || ride?.status === 'cancelled' ? 1 : 0.3
          }}
          onPress={() => {
            if ((statusIndex === STATUS_FLOW.length - 1 && paymentCollected) || ride?.status === 'cancelled') {
              navigation.goBack();
            } else {
              Alert.alert(
                'Cannot Go Back',
                'You cannot go back while the ride is in progress. Please complete or cancel the ride first.',
                [{ text: 'OK', style: 'default' }]
              );
            }
          }}
          disabled={(statusIndex !== STATUS_FLOW.length - 1 || !paymentCollected) && ride?.status !== 'cancelled'}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={(statusIndex === STATUS_FLOW.length - 1 && paymentCollected) || ride?.status === 'cancelled' ? Colors.light.primary : Colors.light.secondary}
          />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.secondary, fontFamily: 'Inter' }}>
            Ride #{ride.id.slice(-6)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
            <MaterialCommunityIcons
              name={getStatusIcon(ride.status)}
              size={16}
              color={getStatusColor(ride.status)}
            />
            <Text style={{ fontSize: 14, color: getStatusColor(ride.status), marginLeft: 6, fontWeight: '600', fontFamily: 'Inter' }}>
              {ride.status}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: Colors.light.primary, fontFamily: 'Inter' }}>
            ₹{ride.fare}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.light.secondary, fontFamily: 'Inter' }}>
            Total Fare
          </Text>
        </View>
      </View>

      {/* Map Section - Animated Height */}
      <Animated.View style={{
        height: bottomSectionHeight.interpolate({
          inputRange: [0, 1],
          outputRange: ['45%', '25%']
        }),
        backgroundColor: Colors.light.background
      }}>
        {mapRegion && MapView && Marker && Polyline ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            region={mapRegion}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {/* Driver Location Marker */}
            {driverLocation && (
              <Marker
                coordinate={driverLocation}
                title="Your Location"
                description="Driver location"
              >
                <View style={{ backgroundColor: Colors.light.primary, borderRadius: 20, padding: 8 }}>
                  <MaterialCommunityIcons name="car" size={20} color={Colors.light.surface} />
                </View>
              </Marker>
            )}

            {/* Pickup Location Marker */}
            {ride.pickup && (
              <Marker
                coordinate={ride.pickup}
                title="Pickup Location"
                description={pickupAddress}
              >
                <View style={{ backgroundColor: Colors.light.primary, borderRadius: 20, padding: 8 }}>
                  <MaterialCommunityIcons name="map-marker" size={20} color={Colors.light.surface} />
                </View>
              </Marker>
            )}

            {/* Dropoff Location Marker */}
            {ride.dropoff && (
              <Marker
                coordinate={ride.dropoff}
                title="Destination"
                description={dropoffAddress}
              >
                <View style={{ backgroundColor: '#34C759', borderRadius: 20, padding: 8 }}>
                  <MaterialCommunityIcons name="flag-checkered" size={20} color={Colors.light.surface} />
                </View>
              </Marker>
            )}

            {/* Route Polyline */}
            {isRouteVisible && routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeWidth={4}
                strokeColor={statusIndex === 0 ? Colors.light.primary : '#FF9500'}
                strokeColors={statusIndex === 0 ? [Colors.light.primary] : ['#FF9500']}
              />
            )}
          </MapView>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14 }}>
            <MaterialCommunityIcons name="map" size={48} color={Colors.light.primary} />
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.secondary, marginTop: 12, textAlign: 'center', fontFamily: 'Inter' }}>
              Location Information
            </Text>
            <Text style={{ fontSize: 14, color: Colors.light.secondary, marginTop: 8, textAlign: 'center', fontFamily: 'Inter' }}>
              {MapView ? 'Loading map...' : 'Map view not available'}
            </Text>

            {/* Location Cards */}
            <View style={{ marginTop: 10, width: '100%' }}>
              {/* Driver Location */}
              {driverLocation && (
                <View style={{ marginBottom: 12, padding: 12, backgroundColor: Colors.light.card, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="car" size={16} color={Colors.light.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.light.secondary, marginLeft: 8, fontFamily: 'Inter' }}>
                      Your Location
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 24, fontFamily: 'Inter' }}>
                    {driverLocation.latitude.toFixed(5)}, {driverLocation.longitude.toFixed(5)}
                  </Text>
                </View>
              )}

              {/* Pickup Location */}
              {ride.pickup && (
                <View style={{ marginBottom: 12, padding: 12, backgroundColor: Colors.light.card, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="map-marker" size={16} color={Colors.light.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.light.secondary, marginLeft: 8, fontFamily: 'Inter' }}>
                      Pickup Location
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 24, fontFamily: 'Inter' }}>
                    {pickupAddress || `${ride.pickup.latitude.toFixed(5)}, ${ride.pickup.longitude.toFixed(5)}`}
                  </Text>
                </View>
              )}

              {/* Dropoff Location */}
              {ride.dropoff && (
                <View style={{ padding: 12, backgroundColor: Colors.light.card, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="flag-checkered" size={16} color="#34C759" />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.light.secondary, marginLeft: 8, fontFamily: 'Inter' }}>
                      Destination
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: Colors.light.secondary, marginLeft: 24, fontFamily: 'Inter' }}>
                    {dropoffAddress || `${ride.dropoff.latitude.toFixed(5)}, ${ride.dropoff.longitude.toFixed(5)}`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Animated.View>

      {/* Details Section - Animated Height */}
      <Animated.View style={{
        height: bottomSectionHeight.interpolate({
          inputRange: [0, 1],
          outputRange: ['55%', '75%']
        }),
        backgroundColor: Colors.light.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 6,
      }}>
        {/* Ride Details - Only show when not collecting payment */}
        {!(statusIndex === STATUS_FLOW.length - 1 && showPaymentSelection) && (
          <View style={{ marginBottom: 20 }}>
            {/* Section Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{
                width: 4,
                height: 20,
                backgroundColor: Colors.light.primary,
                borderRadius: 2,
                marginRight: 12
              }} />
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: Colors.light.secondary,
                fontFamily: 'Inter',
                letterSpacing: -0.5
              }}>
                Ride Details
              </Text>
            </View>

            {/* Route Status Indicator */}
            {isRouteVisible && (
              <View style={{
                backgroundColor: statusIndex === 0 ? Colors.light.primary + '18' : '#FF9500' + '18',
                borderRadius: 8,
                padding: 8,
                marginBottom: 20,
                borderLeftWidth: 4,
                borderLeftColor: statusIndex === 0 ? Colors.light.primary : '#FF9500',
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <MaterialCommunityIcons
                  name={statusIndex === 0 ? 'car' : 'map-marker-path'}
                  size={16}
                  color={statusIndex === 0 ? Colors.light.primary : '#FF9500'}
                />
                <Text style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: statusIndex === 0 ? Colors.light.primary : '#FF9500',
                  marginLeft: 8,
                  fontFamily: 'Inter',
                  letterSpacing: 0.1
                }}>
                  {statusIndex === 0 ? 'Route to Pickup' : 'Route to Destination'}
                </Text>
              </View>
            )}

            {/* Location Cards Container */}
            <View style={{
              borderRadius: 16,
              padding: 1,
              marginHorizontal: 12,
              marginTop: -10,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}>
              {/* Header with customer info */}
              {ride.customerName && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.light.background + '30',
                }}>
                  <View style={{
                    backgroundColor: Colors.light.primary + '15',
                    borderRadius: 24,
                    padding: 8,
                    marginRight: 12,
                  }}>
                    <MaterialCommunityIcons name="account" size={20} color={Colors.light.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: Colors.light.text,
                      fontFamily: 'Inter',
                    }}>
                      {ride.customerName}
                    </Text>
                    <Text style={{
                      fontSize: 12,
                      color: Colors.light.secondary,
                      fontFamily: 'Inter',
                      marginTop: 2,
                    }}>
                      Customer
                    </Text>
                  </View>
                </View>
              )}

              {/* Trip Route */}
              <View style={{ gap: 12 }}>
                {/* Pickup Location */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{
                    alignItems: 'center',
                    marginRight: 16,
                    marginTop: 2,
                  }}>
                    <View style={{
                      backgroundColor: Colors.light.primary,
                      borderRadius: 8,
                      padding: 6,
                    }}>
                      <MaterialCommunityIcons name="map-marker" size={16} color="white" />
                    </View>
                    <View style={{
                      width: 2,
                      height: 24,
                      backgroundColor: Colors.light.background + '60',
                      marginTop: 4,
                    }} />
                  </View>
                  <View style={{ flex: 1, paddingTop: 2 }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: Colors.light.secondary,
                      fontFamily: 'Inter',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}>
                      PICKUP
                    </Text>
                    <Text style={{
                      fontSize: 15,
                      color: Colors.light.text,
                      fontFamily: 'Inter',
                      lineHeight: 20,
                      fontWeight: '500',
                    }}>
                      {pickupAddress || 'Loading location...'}
                    </Text>
                  </View>
                </View>

                {/* Destination */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{
                    alignItems: 'center',
                    marginRight: 16,
                    marginTop: 2,
                  }}>
                    <View style={{
                      backgroundColor: '#34C759',
                      borderRadius: 8,
                      padding: 6,
                    }}>
                      <MaterialCommunityIcons name="flag-checkered" size={16} color="white" />
                    </View>
                  </View>
                  <View style={{ flex: 1, paddingTop: 2 }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: Colors.light.secondary,
                      fontFamily: 'Inter',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}>
                      DESTINATION
                    </Text>
                    <Text style={{
                      fontSize: 15,
                      color: Colors.light.text,
                      fontFamily: 'Inter',
                      lineHeight: 20,
                      fontWeight: '500',
                    }}>
                      {dropoffAddress || 'Loading location...'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Payment Collection - Only after ride completion */}
        {statusIndex === STATUS_FLOW.length - 1 && !paymentCollected && showPaymentSelection && (
          <View style={{
            borderRadius: 20,
            padding: 18,
            marginBottom: 20,
            borderColor: Colors.light.background
          }}>
            {/* Success Header */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{
                backgroundColor: '#34C759' + '20',
                borderRadius: 50,
                padding: 12,
                marginBottom: 12
              }}>
                <MaterialCommunityIcons name="check-circle" size={32} color="#34C759" />
              </View>
              <Text style={{
                fontSize: 20,
                fontWeight: '700',
                color: Colors.light.secondary,
                marginBottom: 6,
                fontFamily: 'Inter',
                textAlign: 'center'
              }}>
                Ride Completed!
              </Text>
              <Text style={{
                fontSize: 14,
                color: Colors.light.secondary + 'CC',
                textAlign: 'center',
                fontFamily: 'Inter',
                lineHeight: 20
              }}>
                Now collect payment from customer
              </Text>
            </View>

            {/* Fare Display */}
            {ride.fare && (
              <View style={{
                backgroundColor: Colors.light.primary + '08',
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: Colors.light.primary + '20'
              }}>
                <Text style={{
                  fontSize: 13,
                  color: Colors.light.secondary,
                  marginBottom: 6,
                  fontFamily: 'Inter',
                  fontWeight: '500'
                }}>
                  Total Fare
                </Text>
                <Text style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: Colors.light.primary,
                  fontFamily: 'Inter'
                }}>
                  ₹{ride.fare}
                </Text>
              </View>
            )}

            {/* Payment Method Selection */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{
                fontSize: 15,
                fontWeight: '600',
                color: Colors.light.secondary,
                marginBottom: 16,
                fontFamily: 'Inter'
              }}>
                Select Payment Method
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: paymentMethod === 'cash' ? Colors.light.primary : Colors.light.background,
                    backgroundColor: paymentMethod === 'cash' ? Colors.light.primary + '12' : Colors.light.background,
                    alignItems: 'center',
                    shadowColor: paymentMethod === 'cash' ? Colors.light.primary : 'transparent',
                    shadowOpacity: paymentMethod === 'cash' ? 0.1 : 0,
                    shadowRadius: 8,
                  }}
                  onPress={() => setPaymentMethod('cash')}
                >
                  <MaterialCommunityIcons
                    name="cash"
                    size={24}
                    color={paymentMethod === 'cash' ? Colors.light.primary : Colors.light.secondary}
                  />
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: paymentMethod === 'cash' ? Colors.light.primary : Colors.light.secondary,
                    marginTop: 8,
                    fontFamily: 'Inter'
                  }}>
                    Cash
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: paymentMethod === 'online' ? Colors.light.primary : Colors.light.background,
                    backgroundColor: paymentMethod === 'online' ? Colors.light.primary + '12' : Colors.light.background,
                    alignItems: 'center',
                    shadowColor: paymentMethod === 'online' ? Colors.light.primary : 'transparent',
                    shadowOpacity: paymentMethod === 'online' ? 0.1 : 0,
                    shadowRadius: 8,
                  }}
                  onPress={() => setPaymentMethod('online')}
                >
                  <MaterialCommunityIcons
                    name="credit-card"
                    size={24}
                    color={paymentMethod === 'online' ? Colors.light.primary : Colors.light.secondary}
                  />
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: paymentMethod === 'online' ? Colors.light.primary : Colors.light.secondary,
                    marginTop: 8,
                    fontFamily: 'Inter'
                  }}>
                    Online
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Complete Button */}
            <TouchableOpacity
              style={{
                backgroundColor: Colors.light.primary,
                borderRadius: 12,
                paddingVertical: 16,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: Colors.light.primary,
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 6,
              }}
              onPress={completeRideWithPayment}
              disabled={updating}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={Colors.light.surface}
                style={{ marginRight: 10 }}
              />
              <Text style={{
                color: Colors.light.surface,
                fontSize: 16,
                fontWeight: '700',
                fontFamily: 'Inter',
                letterSpacing: 0.2
              }}>
                {updating ? 'Completing...' : 'Complete & Collect Payment'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        {statusIndex < STATUS_FLOW.length - 1 && (
          <>
            <TouchableOpacity
              style={{
                backgroundColor: getStatusColor(ride.status),
                borderRadius: 12,
                paddingVertical: 14,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
                shadowColor: getStatusColor(ride.status),
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 6,
              }}
              onPress={advanceStatus}
              disabled={updating}
            >
              <MaterialCommunityIcons
                name={statusIndex === 0 ? 'account-check' : 'flag-checkered'}
                size={20}
                color={Colors.light.surface}
                style={{ marginRight: 10 }}
              />
              <Text style={{
                fontSize: 16,
                fontWeight: '700',
                color: Colors.light.surface,
                fontFamily: 'Inter',
                letterSpacing: 0.2
              }}>
                {updating ? 'Updating...' :
                  statusIndex === 0 ? 'Pickup Customer' :
                    statusIndex === 1 ? 'Complete Ride' : 'Advance Status'
                }
              </Text>
            </TouchableOpacity>

            {/* Cancel Ride Button
            <TouchableOpacity
              style={{
                backgroundColor: '#FF3B30',
                borderRadius: 12,
                paddingVertical: 12,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
                shadowColor: '#FF3B30',
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 6,
              }}
              onPress={cancelRide}
              disabled={updating}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={Colors.light.surface}
                style={{ marginRight: 8 }}
              />
              <Text style={{
                fontSize: 15,
                fontWeight: '600',
                color: Colors.light.surface,
                fontFamily: 'Inter',
                letterSpacing: 0.2
              }}>
                Cancel Ride
              </Text>
            </TouchableOpacity> */}
          </>
        )}

        {/* Final Completion State */}
        {statusIndex === STATUS_FLOW.length - 1 && paymentCollected && (
          <View style={{
            backgroundColor: '#34C759',
            borderRadius: 20,
            padding: 28,
            alignItems: 'center',
            marginBottom: 12,
            shadowColor: '#34C759',
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 8,
          }}>
            <View style={{
              backgroundColor: Colors.light.surface + '20',
              borderRadius: 50,
              padding: 12,
              marginBottom: 16
            }}>
              <MaterialCommunityIcons name="check-circle" size={32} color={Colors.light.surface} />
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: Colors.light.surface,
              marginBottom: 8,
              fontFamily: 'Inter',
              textAlign: 'center'
            }}>
              Ride Successfully Completed!
            </Text>
            <Text style={{
              fontSize: 14,
              color: Colors.light.surface + 'CC',
              marginBottom: 20,
              fontFamily: 'Inter',
              textAlign: 'center',
              lineHeight: 20
            }}>
              Payment: {paymentMethod === 'cash' ? 'Cash' : 'Online'} - ₹{ride.fare}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: Colors.light.surface,
                borderRadius: 12,
                paddingHorizontal: 28,
                paddingVertical: 14,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 6,
              }}
              onPress={() => navigation.goBack()}
            >
              <MaterialCommunityIcons
                name="home"
                size={18}
                color="#34C759"
                style={{ marginRight: 10 }}
              />
              <Text style={{
                color: '#34C759',
                fontSize: 16,
                fontWeight: '700',
                fontFamily: 'Inter',
                letterSpacing: 0.2
              }}>
                Back to Home
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
} 