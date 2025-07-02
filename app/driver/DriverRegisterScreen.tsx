import { auth, db } from '@/app/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tw from 'tailwind-react-native-classnames';

// Type for auth and db
const typedAuth: ReturnType<typeof getAuth> = auth;
const typedDb: ReturnType<typeof getFirestore> = db;

export default function DriverRegisterScreen({ navigation }: { navigation: any }) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [mobile, setMobile] = useState<string>('');
  const [license, setLicense] = useState<string>('');
  const [vehicle, setVehicle] = useState<string>('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const pickImage = async (): Promise<void> => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri as string);
    }
  };

  const pickProfilePhoto = async (): Promise<void> => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      setProfilePhoto(result.assets[0].uri as string);
    }
  };

  const uploadImageAsync = async (uri: string, path: string): Promise<string> => {
    if (!uri || typeof uri !== 'string') {
      throw new Error('Invalid image URI. Please select a valid image.');
    }
    setUploading(true);
    try {
      const storage = getStorage();
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (e) {
      console.log('Firebase Storage upload error:', e);
      throw e;
    } finally {
      setUploading(false);
    }
  };

  const handleRegister = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      if (!name || !mobile || !license || !vehicle) {
        setError('Please fill all fields.');
        setLoading(false);
        return;
      }
      const userCred = await createUserWithEmailAndPassword(typedAuth, email, password);
      const uid = userCred.user.uid;
      let docUrl = '';
      let profilePhotoUrl = '';
      if (image) {
        docUrl = await uploadImageAsync(image, `driverDocs/${uid}`);
      }
      if (profilePhoto) {
        profilePhotoUrl = await uploadImageAsync(profilePhoto, `driverProfilePhotos/${uid}`);
      }
      await setDoc(doc(typedDb, 'drivers', uid), {
        email,
        name,
        mobile,
        license,
        vehicle,
        profilePhotoUrl: profilePhotoUrl || '',
        documentUrl: docUrl || '',
        verified: false,
        createdAt: new Date(),
      });
      navigation.replace('DriverHome');
    } catch (e) {
      const err = e as Error;
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={tw`flex-1 bg-white`}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={tw`text-3xl font-bold text-blue-600 mb-6 text-center`}>Driver Registration</Text>
      {/* Personal Info Section */}
      <Text style={tw`text-base font-semibold text-gray-700 mb-2`}>Personal Information</Text>
      <View style={tw`mb-4 bg-gray-50 rounded-xl px-4 py-4`}> 
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Full Name</Text>
        <TextInput
          placeholder="Enter your name"
          value={name}
          onChangeText={setName}
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
        />
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Mobile Number</Text>
        <TextInput
          placeholder="Enter your mobile number"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
        />
      </View>
      {/* License & Vehicle Section */}
      <Text style={tw`text-base font-semibold text-gray-700 mb-2`}>License & Vehicle</Text>
      <View style={tw`mb-4 bg-gray-50 rounded-xl px-4 py-4`}> 
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Driving License Number</Text>
        <TextInput
          placeholder="Enter your license number"
          value={license}
          onChangeText={setLicense}
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
        />
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Vehicle Number</Text>
        <TextInput
          placeholder="Enter your vehicle number"
          value={vehicle}
          onChangeText={setVehicle}
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
        />
      </View>
      {/* Account Section */}
      <Text style={tw`text-base font-semibold text-gray-700 mb-2`}>Account Details</Text>
      <View style={tw`mb-4 bg-gray-50 rounded-xl px-4 py-4`}> 
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Email</Text>
        <TextInput
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
          autoCapitalize="none"
        />
        <Text style={tw`text-xs text-gray-600 mb-1 ml-1`}>Password</Text>
        <TextInput
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={tw`border border-gray-300 rounded-xl px-4 py-3 mb-2 text-base bg-white`}
          placeholderTextColor="#A0AEC0"
        />
      </View>
      {/* Profile Photo Section */}
      <Text style={tw`text-base font-semibold text-gray-700 mb-2`}>Profile Photo</Text>
      <TouchableOpacity
        style={tw`flex-row items-center justify-center bg-blue-50 py-3 rounded-xl w-full mb-2 mt-1 border border-blue-200`}
        onPress={pickProfilePhoto}
        disabled={uploading}
      >
        <Text style={tw`text-blue-700 text-lg font-semibold mr-2`}>{uploading ? 'Uploading...' : 'Pick Profile Photo'}</Text>
      </TouchableOpacity>
      {profilePhoto && <Image source={{ uri: profilePhoto }} style={tw`w-24 h-24 my-2 rounded-full self-center border-2 border-blue-400`} />}
      {/* Document Image Section */}
      <Text style={tw`text-base font-semibold text-gray-700 mb-2 mt-2`}>Driving License/Document Image</Text>
      <TouchableOpacity
        style={tw`flex-row items-center justify-center bg-blue-50 py-3 rounded-xl w-full mb-2 mt-1 border border-blue-200`}
        onPress={pickImage}
        disabled={uploading}
      >
        <Text style={tw`text-blue-700 text-lg font-semibold mr-2`}>{uploading ? 'Uploading...' : 'Pick Document Image'}</Text>
      </TouchableOpacity>
      {image && <Image source={{ uri: image }} style={tw`w-32 h-24 my-2 rounded-lg self-center border-2 border-blue-400`} />}
      {error ? <Text style={tw`text-red-500 mb-2 text-center`}>{error}</Text> : null}
      <TouchableOpacity
        style={tw`bg-green-600 py-3 rounded-xl w-full mb-4 mt-2`}
        onPress={handleRegister}
        disabled={uploading || loading}
      >
        <Text style={tw`text-white text-center text-lg font-semibold`}>{loading ? 'Registering...' : 'Register'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('DriverLogin')}>
        <Text style={tw`text-blue-600 text-center text-base`}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
} 