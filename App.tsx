import { Ionicons } from '@expo/vector-icons';
import { createDrawerNavigator, DrawerContentComponentProps, DrawerContentScrollView, DrawerItem, DrawerItemList, DrawerNavigationProp } from '@react-navigation/drawer';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useFonts } from 'expo-font';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, DocumentSnapshot, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommissionSummaryScreen from './app/driver/CommissionSummaryScreen';
import DriverHomeScreen from './app/driver/DriverHomeScreen';
import DriverProfileScreen from './app/driver/DriverProfileScreen';
import DriverRideStatusScreen from './app/driver/DriverRideStatusScreen';
import DriverVerificationScreen from './app/driver/DriverVerificationScreen';
import PlatformFeeTransactionsScreen from './app/driver/PlatformFeeTransactionsScreen';
import WelcomeScreen from './app/driver/WelcomeScreen';
import { Colors } from './constants/Colors';
import { db, getFirebaseAuth } from './firebaseConfig';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

function CustomDrawerContent(props: DrawerContentComponentProps & { profile?: { profilePhotoUrl?: string; name?: string } }) {
  const profile = props?.profile || {};
  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: Colors.light.surface, paddingTop: 32, flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, minHeight: '100%' }}>
        {/* App Logo Placeholder */}
        <View style={{ alignItems: 'center', marginTop: 0, marginBottom: 16 }}>
          {profile.profilePhotoUrl ? (
            <Image source={{ uri: profile.profilePhotoUrl }} style={{ width: 48, height: 48, borderRadius: 24, marginBottom: 4, borderWidth: 2, borderColor: Colors.light.primary }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.light.background, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Image source={require('./assets/images/skootyGo.png')} style={{ width: 32, height: 32, borderRadius: 16, opacity: 0.3 }} />
            </View>
          )}
          <Text style={{ fontWeight: '700', color: Colors.light.secondary, fontSize: 18, fontFamily: 'Poppins-Medium', marginBottom: 2 }}>{profile.name || 'Driver'}</Text>
        </View>
        <View style={{ marginHorizontal: 8, marginBottom: 8 }}>
          <DrawerItemList {...props} />
        </View>
        <View style={{ flex: 1 }} /> {/* Spacer to push logout to bottom */}
        <View style={{ marginHorizontal: 8, marginTop: 12, marginBottom: 62, }}>
          <DrawerItem
            label="Logout"
            labelStyle={{ color: Colors.light.card, fontWeight: 'bold', fontFamily: 'Poppins-Medium', fontSize: 16 }}
            style={{ borderRadius: 12, backgroundColor: Colors.dark.primary, marginTop: 8 }}
            onPress={async () => {
              const auth = getFirebaseAuth();
              await signOut(auth);
            }}
          />
        </View>
      </View>
    </DrawerContentScrollView>
  );
}

function DrawerMenuHeader({ tintColor }: { tintColor?: string }) {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  return (
    <TouchableOpacity
      style={{
        backgroundColor: Colors.light.surface,
        borderRadius: 10,
        padding: 10,
        elevation: 2,
        marginLeft: 20,
        shadowColor: Colors.light.primary,
        shadowOpacity: 0.10,
        shadowRadius: 4,
      }}
      onPress={() => navigation.openDrawer()}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name="menu" size={28} color={tintColor || Colors.light.primary} />
    </TouchableOpacity>
  );
}

function ProfileHeaderRight({ profile }: { profile?: { profilePhotoUrl?: string; name?: string } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 18 }}>
      <Text
        style={{
          color: Colors.light.secondary,
          fontWeight: '600',
          fontSize: 17,
          marginRight: 10,
          fontFamily: 'Poppins-Medium',
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {profile?.name ? `Hi, ${profile.name}` : ''}
      </Text>
      {profile?.profilePhotoUrl ? (
        <TouchableOpacity onPress={() => {/* TODO: handle profile press */ }}>
          <Image
            source={{ uri: profile.profilePhotoUrl }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 2,
              borderColor: Colors.light.primary,
              backgroundColor: Colors.light.surface,
              shadowColor: Colors.light.primary,
              shadowOpacity: 0.12,
              shadowRadius: 4,
            }}
          />
        </TouchableOpacity>
      ) : (
        <MaterialCommunityIcons name="account" size={24} color={Colors.light.secondary} />
      )}
    </View>
  );
}

function DriverDrawer() {
  const [profile, setProfile] = React.useState<{ profilePhotoUrl?: string; name?: string } | null>(null);

  React.useEffect(() => {
    let unsubscribeAuth: any;
    let unsubscribeProfile: any;
    async function fetchProfile(user: any) {
      if (!user) {
        setProfile(null);
        return;
      }
      const docRef = doc(db, 'drivers', user.uid);
      unsubscribeProfile = onSnapshot(docRef, (docSnap: DocumentSnapshot) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data) {
            setProfile({ name: data.name, profilePhotoUrl: data.profilePhotoUrl });
          } else {
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
      });
    }
    const auth = getFirebaseAuth();
    unsubscribeAuth = onAuthStateChanged(auth, fetchProfile);
    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <Drawer.Navigator
      initialRouteName="DriverHome"
      drawerContent={props => <CustomDrawerContent {...props} profile={profile || undefined} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.light.surface, borderBottomWidth: 0, elevation: 0.1, borderBottomEndRadius: 20, borderBottomStartRadius: 20 },
        headerTitle: () => null, // Remove the title
        headerTintColor: Colors.light.primary,
        drawerActiveTintColor: Colors.light.primary,
        drawerInactiveTintColor: Colors.light.secondary + '99',
        drawerStyle: { backgroundColor: Colors.light.surface, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
        drawerLabelStyle: { fontWeight: 'bold', fontSize: 16, fontFamily: 'Poppins-Medium' },
        headerLeft: ({ tintColor }) => <DrawerMenuHeader tintColor={tintColor} />, // Only menu icon
        headerRight: () => <ProfileHeaderRight profile={profile || undefined} />,   // Profile image and username on right
      }}
    >
      <Drawer.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{
          title: 'Home',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="DriverProfileScreen"
        component={DriverProfileScreen}
        options={{
          title: 'Profile',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="DriverVerification"
        component={DriverVerificationScreen}
        options={{
          title: 'Account Status',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="CommissionSummary"
        component={CommissionSummaryScreen}
        options={{
          title: 'Earnings & Fees',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="PlatformFeeTransactions"
        component={PlatformFeeTransactionsScreen}
        options={{
          title: 'Platform Fee History',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Poppins-Medium': require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('./assets/fonts/Poppins-Bold.ttf'),
  });

  const [isAuthenticated, setIsAuthenticated] = useState<null | boolean>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    console.debug('[App] useEffect: Setting up onAuthStateChanged');
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      console.debug('[App] onAuthStateChanged:', user ? `User UID: ${user.uid}` : 'No user');
      setIsAuthenticated(!!user);
    });
    return unsubscribe;
  }, []);

  if (!fontsLoaded || isAuthenticated === null) {
    console.debug('[App] Waiting for fonts or auth state...');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.background }}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  console.debug('[App] Rendering NavigationContainer. isAuthenticated:', isAuthenticated);
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={isAuthenticated ? 'DriverDrawer' : 'Welcome'} screenOptions={{ headerShown: false }}>
        {!isAuthenticated && (
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        )}
        {isAuthenticated && (
          <Stack.Screen name="DriverDrawer" component={DriverDrawer} />
        )}
        <Stack.Screen name="DriverRideStatus" component={DriverRideStatusScreen as any} />
        <Stack.Screen name="DriverProfileScreen" component={DriverProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 