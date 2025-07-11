import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Keyboard,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-root-toast';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/Colors';
import { getFirebaseAuth, db as rawDb, storage as rawStorage } from '../../firebaseConfig';

interface DriverProfile {
    name?: string;
    mobile?: string;
    license?: string;
    vehicle?: string;
    profilePhotoUrl?: string | null;
    vehicleType?: 'auto' | 'bike';
    bikeModel?: string;
    verificationStatus?: 'pending' | 'verified' | 'rejected';
}

const auth = getFirebaseAuth();
const db = rawDb;
const storage = rawStorage;

const isValidProfile = (profile: DriverProfile | null) => {
    if (!profile) return false;
    if (!profile.name || !profile.mobile || !profile.license || !profile.vehicle || !profile.vehicleType) return false;
    if (!/^\d{10}$/.test(profile.mobile)) return false;
    if (profile.license.length < 5) return false;
    return true;
};

export default function DriverProfileScreen({ navigation }: { navigation: any }) {
    const [profile, setProfile] = useState<DriverProfile | null>(null);
    const [editProfile, setEditProfile] = useState<DriverProfile | null>(null);
    const [editPhoto, setEditPhoto] = useState<string | null>(null);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileErrors, setProfileErrors] = useState<{ [k: string]: string }>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfile() {
            setLoading(true);
            try {
                const user = auth.currentUser;
                if (!user) throw new Error('Not logged in');
                const docRef = doc(db, 'drivers', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as DriverProfile;
                    setProfile(data);
                    setEditProfile(data);
                    setEditPhoto(data.profilePhotoUrl || null);
                } else {
                    setProfile(null);
                    setEditProfile({
                        name: '',
                        mobile: '',
                        license: '',
                        vehicle: '',
                        vehicleType: 'auto',
                        profilePhotoUrl: null,
                        bikeModel: '',
                    });
                    setEditPhoto(null);
                }
            } catch (e) {
                setProfile(null);
                setEditProfile(null);
                setEditPhoto(null);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    const pickEditProfilePhoto = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setEditPhoto(result.assets[0].uri as string);
        }
    };

    const handleSaveProfile = async () => {
        if (!editProfile) return;
        setSavingProfile(true);
        Keyboard.dismiss();
        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Not logged in');
            let profilePhotoUrl = editPhoto;
            if (editPhoto && editPhoto !== profile?.profilePhotoUrl) {
                const response = await fetch(editPhoto);
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                const blob = await response.blob();
                const storageRef = ref(storage, `driverProfilePhotos/${user.uid}`);
                await uploadBytes(storageRef, blob);
                profilePhotoUrl = await getDownloadURL(storageRef);
            }
            if (profile && isValidProfile(profile)) {
                const updateData = {
                    name: editProfile.name,
                    mobile: editProfile.mobile,
                    license: editProfile.license,
                    vehicle: editProfile.vehicle,
                    profilePhotoUrl,
                    vehicleType: editProfile.vehicleType,
                    bikeModel: editProfile.bikeModel || '',
                };
                await updateDoc(doc(db, 'drivers', user.uid), updateData);
                setProfile({ ...profile, ...editProfile, profilePhotoUrl } as DriverProfile);
                Toast.show('Profile updated!', { duration: Toast.durations.SHORT, backgroundColor: Colors.light.primary, textColor: Colors.light.background });
            } else {
                const createData = {
                    name: editProfile.name,
                    mobile: editProfile.mobile,
                    license: editProfile.license,
                    vehicle: editProfile.vehicle,
                    profilePhotoUrl,
                    vehicleType: editProfile.vehicleType,
                    bikeModel: editProfile.bikeModel || '',
                    createdAt: new Date(),
                };
                await setDoc(doc(db, 'drivers', user.uid), createData);
                setProfile({ ...editProfile, profilePhotoUrl } as DriverProfile);
                Toast.show('Profile created!', { duration: Toast.durations.SHORT, backgroundColor: Colors.light.primary, textColor: Colors.light.background });
            }
            navigation.goBack();
        } catch (e: any) {
            let errorMessage = 'Could not update profile.';
            if (e?.message) errorMessage = `Error: ${e.message}`;
            Toast.show(errorMessage, { duration: Toast.durations.SHORT, backgroundColor: '#e53935', textColor: Colors.light.background });
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) return <ActivityIndicator size="large" color={Colors.light.primary} style={{ marginTop: 40 }} />;
    if (!editProfile) return <Text style={{ marginTop: 40, color: Colors.light.secondary }}>Could not load profile.</Text>;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: Colors.light.surface }}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 40, paddingHorizontal: 50, alignItems: 'center' }}
            showsVerticalScrollIndicator={false}
        >
            <View style={{ width: '100%', alignItems: 'center', marginBottom: 24 }}>
                <TouchableOpacity style={{ marginBottom: 24 }} onPress={pickEditProfilePhoto} activeOpacity={0.85}>
                    {editPhoto ? (
                        <Image source={{ uri: editPhoto }} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: Colors.light.primary, marginBottom: 8 }} />
                    ) : (
                        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.light.background, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                            <MaterialCommunityIcons name="account" size={48} color={Colors.light.primary} />
                        </View>
                    )}
                    <Text style={{ color: Colors.light.primary, fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Change Photo</Text>
                </TouchableOpacity>
            </View>
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
                {!!profileErrors.name && <Text style={{ color: '#e53935', fontSize: 13 }}>{profileErrors.name}</Text>}
            </View>
            <View style={{ width: '100%', marginBottom: 18 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 4, color: Colors.light.secondary, fontFamily: 'Inter' }}>Mobile Number</Text>
                <TextInput
                    value={editProfile.mobile}
                    onChangeText={v => {
                        setEditProfile({ ...editProfile, mobile: v });
                        setProfileErrors({ ...profileErrors, mobile: /^\d{10}$/.test(v) ? '' : 'Enter a valid 10-digit mobile number' });
                    }}
                    keyboardType="numeric"
                    style={{ width: '100%', backgroundColor: Colors.light.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.surface, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: Colors.light.secondary, marginBottom: 2, fontFamily: 'Inter' }}
                    placeholder="Mobile Number"
                    placeholderTextColor={Colors.light.secondary + '99'}
                />
                {!!profileErrors.mobile && <Text style={{ color: '#e53935', fontSize: 13 }}>{profileErrors.mobile}</Text>}
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
                {!!profileErrors.license && <Text style={{ color: '#e53935', fontSize: 13 }}>{profileErrors.license}</Text>}
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
                {!!profileErrors.vehicle && <Text style={{ color: '#e53935', fontSize: 13 }}>{profileErrors.vehicle}</Text>}
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
        </ScrollView>
    );
} 