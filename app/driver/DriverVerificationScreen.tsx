import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { getFirebaseAuth, db as rawDb, storage as rawStorage } from '../../firebaseConfig';

const auth = getFirebaseAuth();
const db = rawDb;
const storage = rawStorage;

const docTypes = [
  { key: 'licenseFront', label: 'Driver’s License (Front)' },
  { key: 'licenseBack', label: 'Driver’s License (Back)' },
  { key: 'rc', label: 'Vehicle RC' },
  { key: 'aadhaar', label: 'Aadhaar / National ID' },
];

export default function DriverVerificationScreen({ navigation }: { navigation: any }) {
  const [images, setImages] = useState<{ [k: string]: string | null }>({
    licenseFront: null,
    licenseBack: null,
    rc: null,
    aadhaar: null,
  });
  const [uploading, setUploading] = useState<{ [k: string]: boolean }>({});
  const [uploadUrls, setUploadUrls] = useState<{ [k: string]: string | null }>({});
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false); // <-- NEW STATE

  // Fetch and listen to verification status
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const docRef = doc(db, 'drivers', user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setVerificationStatus(data.verificationStatus || null);
      }
    });
    return () => unsubscribe();
  }, []);

  // (No back lock effect)

  const pickImage = async (key: string) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImages({ ...images, [key]: result.assets[0].uri });
    }
  };

  const uploadImage = async (key: string, uri: string) => {
    setUploading(u => ({ ...u, [key]: true }));
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `driverDocuments/${user.uid}/${key}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setUploadUrls(u => ({ ...u, [key]: url }));
    } catch (e) {
      console.error('Upload error for', key, uri, e);
      Alert.alert('Upload Error', 'Could not upload image.');
    } finally {
      setUploading(u => ({ ...u, [key]: false }));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
      // Upload all images if not already uploaded
      for (const { key } of docTypes) {
        if (!uploadUrls[key] && images[key]) {
          await uploadImage(key, images[key]!);
        }
      }
      // After all uploads, update Firestore
      const docData: any = {
        documents: {
          licenseFrontUrl: uploadUrls.licenseFront,
          licenseBackUrl: uploadUrls.licenseBack,
          rcUrl: uploadUrls.rc,
          aadhaarUrl: uploadUrls.aadhaar,
        },
        verificationStatus: 'pending',
      };
      await updateDoc(doc(db, 'drivers', user.uid), docData);
      Alert.alert('Submitted', 'Documents submitted for verification. You will be notified once verified.');
      navigation.navigate('DriverHome');
    } catch (e) {
      Alert.alert('Error', 'Could not submit documents.');
    } finally {
      setSubmitting(false);
    }
  };

  const allUploaded = docTypes.every(({ key }) => images[key] && uploadUrls[key]);

  if (verificationStatus === 'pending') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: Colors.light.surface }}>
        <Text style={{ fontSize: 24, color: Colors.light.primary, fontWeight: 'bold', marginBottom: 18, textAlign: 'center' }}>
          Documents under review
        </Text>
        <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginBottom: 24 }}>
          Your documents have been submitted and are currently under review. You will be notified once your account is verified or if any issues are found.
        </Text>
      </View>
    );
  }

  if (verificationStatus === 'verified') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.surface }}>
        <View style={{
          backgroundColor: Colors.light.card,
          borderRadius: 28,
          paddingVertical: 40,
          paddingHorizontal: 30,
          alignItems: 'center',
          shadowColor: Colors.light.primary,
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
          maxWidth: 300,
          width: '92%',
        }}>
          {/* Checkmark Icon */}
          <View style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: Colors.light.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            shadowColor: Colors.light.primary,
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}>
            <Text style={{ fontSize: 48, color: Colors.light.primary, fontWeight: 'bold', fontFamily: 'Poppins-Medium' }}>✓</Text>
          </View>
          <Text style={{
            fontSize: 28,
            color: Colors.light.primary,
            fontWeight: 'bold',
            marginBottom: 10,
            textAlign: 'center',
            letterSpacing: 0.2,
            fontFamily: 'Poppins-Medium',
          }}>
            Account Verified!
          </Text>
          <Text style={{
            fontSize: 16,
            color: Colors.light.secondary,
            textAlign: 'center',
            marginBottom: 28,
            maxWidth: 320,
            lineHeight: 22,
            fontFamily: 'Poppins-Medium',
          }}>
            Your account is verified! You’re ready to start accepting rides and earning with Skooty. Let’s hit the road!
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: Colors.light.primary,
              borderRadius: 999,
              paddingVertical: 16,
              paddingHorizontal: 48,
              alignItems: 'center',
              shadowColor: Colors.light.primary,
              shadowOpacity: 0.13,
              shadowRadius: 10,
              elevation: 3,
              marginTop: 4,
            }}
            onPress={() => navigation.navigate('DriverHome')}
            activeOpacity={0.88}
          >
            <Text style={{ color: Colors.light.surface, fontSize: 17, fontWeight: 'bold', letterSpacing: 0.1, fontFamily: 'Poppins-Medium' }}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show intro if form not started
  if (!showForm) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.surface, padding: 32 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: Colors.light.primary, marginBottom: 16, textAlign: 'center', fontFamily: 'Poppins-Medium' }}>
          Welcome to Driver Verification
        </Text>
        <Text style={{ fontSize: 17, color: Colors.light.secondary, textAlign: 'center', marginBottom: 32, fontFamily: 'Poppins-Medium', lineHeight: 24 }}>
          To keep our platform safe and reliable, we need to verify your identity. This process is quick and secure. Click below to begin uploading your documents and get started on your journey with us!
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.light.primary, borderRadius: 999, paddingVertical: 18, paddingHorizontal: 48, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: 0.13, shadowRadius: 10, elevation: 3 }}
          onPress={() => setShowForm(true)}
          activeOpacity={0.88}
        >
          <Text style={{ color: Colors.light.surface, fontSize: 18, fontWeight: 'bold', letterSpacing: 0.2, fontFamily: 'Poppins-Medium' }}>Start Verification</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: Colors.light.surface }}>
      {/* Header Section */}
      <View style={{ paddingTop: 48, paddingBottom: 24, alignItems: 'center', backgroundColor: Colors.light.primary + '10', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 18 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: Colors.light.primary, marginBottom: 8, letterSpacing: 0.5, fontFamily: 'Poppins-Medium' }}>Account Verification</Text>
        <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', maxWidth: 320, fontFamily: 'Poppins-Medium' }}>
          Please upload the following documents. Your account will be reviewed and verified by our team.
        </Text>
      </View>

      {/* Progress Indicator */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 18 }}>
        {docTypes.map(({ key }, idx) => (
          <View key={key} style={{
            width: 18, height: 18, borderRadius: 9, marginHorizontal: 6,
            backgroundColor: images[key] ? Colors.light.primary : Colors.light.secondary + '40',
            borderWidth: 2, borderColor: Colors.light.primary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {uploadUrls[key] && (
              <Text style={{ color: Colors.light.surface, fontSize: 12, fontWeight: 'bold', fontFamily: 'Poppins-Medium' }}>✓</Text>
            )}
          </View>
        ))}
      </View>

      {/* Document Upload Cards */}
      <View style={{ alignItems: 'center', width: '100%' }}>
        {docTypes.map(({ key, label }) => (
          <View key={key} style={{
            width: '92%', maxWidth: 370, marginBottom: 22, padding: 18,
            backgroundColor: Colors.light.card, borderRadius: 18, shadowColor: Colors.light.primary, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
            elevation: 2, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: Colors.light.primary, marginBottom: 10, textAlign: 'center', fontFamily: 'Poppins-Medium' }}>{label}</Text>
            {images[key] ? (
              <Image source={{ uri: images[key]! }} style={{ width: 200, height: 130, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.secondary + '40', shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 4 }} />
            ) : (
              <View style={{ width: 200, height: 130, borderRadius: 10, marginBottom: 10, backgroundColor: Colors.light.secondary + '10', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.secondary + '30' }}>
                <Text style={{ color: Colors.light.secondary, fontSize: 15, fontFamily: 'Poppins-Medium' }}>No Image Selected</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'center', width: '100%' }}>
              <TouchableOpacity
                style={{ backgroundColor: Colors.light.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, marginRight: 8, minWidth: 110, alignItems: 'center', opacity: uploading[key] ? 0.7 : 1 }}
                onPress={() => pickImage(key)}
                disabled={uploading[key]}
                activeOpacity={0.85}
              >
                <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 15, fontFamily: 'Poppins-Medium' }}>{images[key] ? 'Change' : 'Select'} Image</Text>
              </TouchableOpacity>
              {images[key] && !uploadUrls[key] && !uploading[key] && (
                <TouchableOpacity
                  style={{ backgroundColor: Colors.light.secondary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, minWidth: 90, alignItems: 'center' }}
                  onPress={() => uploadImage(key, images[key]!)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 15, fontFamily: 'Poppins-Medium' }}>Upload</Text>
                </TouchableOpacity>
              )}
            </View>
            {uploading[key] && <ActivityIndicator color={Colors.light.primary} style={{ marginTop: 8 }} />}
            {uploadUrls[key] && <Text style={{ color: '#34C759', marginTop: 8, fontWeight: '600', fontFamily: 'Poppins-Medium' }}>Uploaded</Text>}
          </View>
        ))}
      </View>

      {/* Submit Button */}
      <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 30 }}>
        <TouchableOpacity
          style={{ backgroundColor: allUploaded ? Colors.light.primary : Colors.light.secondary + '60', borderRadius: 999, paddingVertical: 18, width: '92%', maxWidth: 370, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: allUploaded ? 0.12 : 0, shadowRadius: 8, elevation: allUploaded ? 2 : 0 }}
          onPress={handleSubmit}
          disabled={!allUploaded || submitting}
          activeOpacity={0.85}
        >
          <Text style={{ color: Colors.light.surface, fontSize: 18, fontWeight: 'bold', letterSpacing: 0.2, fontFamily: 'Poppins-Medium' }}>{submitting ? 'Submitting...' : 'Submit for Verification'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
} 