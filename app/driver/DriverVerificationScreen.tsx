import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { auth as rawAuth, db as rawDb, storage as rawStorage } from '../../firebaseConfig';

const auth = rawAuth;
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: Colors.light.surface }}>
        <Text style={{ fontSize: 24, color: '#34C759', fontWeight: 'bold', marginBottom: 18, textAlign: 'center' }}>
          Account status: Approved
        </Text>
        <Text style={{ fontSize: 16, color: Colors.light.secondary, textAlign: 'center', marginBottom: 24 }}>
          Your account has been approved. You can now use all features.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.light.surface }}>
      {/* Back button, only if not pending */}
      {verificationStatus !== 'pending' && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 32, left: 16, zIndex: 10, backgroundColor: Colors.light.primary, borderRadius: 20, padding: 8 }}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('DriverHome');
            }
          }}
        >
          <Text style={{ color: Colors.light.surface, fontWeight: 'bold', fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      )}
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: Colors.light.primary, marginBottom: 18, textAlign: 'center' }}>Account Verification</Text>
      <Text style={{ fontSize: 15, color: Colors.light.secondary, marginBottom: 24, textAlign: 'center' }}>
        Please upload the following documents. Your account will be reviewed and verified by our team.
      </Text>
      {docTypes.map(({ key, label }) => (
        <View key={key} style={{ width: '100%', maxWidth: 350, marginBottom: 22, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.light.secondary, marginBottom: 8 }}>{label}</Text>
          {images[key] ? (
            <Image source={{ uri: images[key]! }} style={{ width: 180, height: 120, borderRadius: 12, marginBottom: 8 }} />
          ) : null}
          <TouchableOpacity
            style={{ backgroundColor: Colors.light.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, marginBottom: 6 }}
            onPress={() => pickImage(key)}
            disabled={uploading[key]}
          >
            <Text style={{ color: Colors.light.surface, fontWeight: 'bold' }}>{images[key] ? 'Change' : 'Upload'} Image</Text>
          </TouchableOpacity>
          {images[key] && !uploadUrls[key] && !uploading[key] && (
            <TouchableOpacity
              style={{ backgroundColor: Colors.light.secondary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 4 }}
              onPress={() => uploadImage(key, images[key]!)}
            >
              <Text style={{ color: Colors.light.surface, fontWeight: 'bold' }}>Upload</Text>
            </TouchableOpacity>
          )}
          {uploading[key] && <ActivityIndicator color={Colors.light.primary} style={{ marginTop: 4 }} />}
          {uploadUrls[key] && <Text style={{ color: '#34C759', marginTop: 4 }}>Uploaded</Text>}
        </View>
      ))}
      <TouchableOpacity
        style={{ backgroundColor: allUploaded ? Colors.light.primary : Colors.light.secondary + '60', borderRadius: 999, paddingVertical: 16, width: '100%', maxWidth: 350, alignItems: 'center', marginTop: 18, marginBottom: 8 }}
        onPress={handleSubmit}
        disabled={!allUploaded || submitting}
        activeOpacity={0.85}
      >
        <Text style={{ color: Colors.light.surface, fontSize: 17, fontWeight: 'bold' }}>{submitting ? 'Submitting...' : 'Submit for Verification'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
} 