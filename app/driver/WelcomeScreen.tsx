import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import React, { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { firebaseConfig, getFirebaseAuth } from '../../firebaseConfig';


interface WelcomeScreenProps {
  navigation: any;
}

type AuthStep = 'welcome' | 'otp' | 'login' | 'signup';

// Helper to map Firebase error codes to user-friendly messages
function getFriendlyAuthError(error: any) {
  if (!error || !error.code) return error.message || 'An error occurred.';
  switch (error.code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/email-already-in-use':
      return 'This email is already in use.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return error.message || 'An error occurred.';
  }
}

// TypeScript declaration for window.recaptchaVerifier
declare global {
  interface Window {
    recaptchaVerifier?: any;
  }
}

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const auth = getFirebaseAuth();
  const [authStep, setAuthStep] = useState<AuthStep>('welcome');
  // Welcome (phone)
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');
  const recaptchaVerifier = useRef<any>(null);
  const isValidPhone = /^\d{10}$/.test(phone);
  const isValidOtp = /^\d{6}$/.test(otp);
  // Login
  // const [loginEmail, setLoginEmail] = useState('');
  // const [loginPassword, setLoginPassword] = useState('');
  // const [loginLoading, setLoginLoading] = useState(false);
  // const [loginError, setLoginError] = useState('');
  // Signup
  // const [signupEmail, setSignupEmail] = useState('');
  // const [signupPassword, setSignupPassword] = useState('');
  // const [signupLoading, setSignupLoading] = useState(false);
  // const [signupError, setSignupError] = useState('');

  // Auth handlers
  // const handleLogin = async () => {
  //   setLoginLoading(true);
  //   setLoginError('');
  //   try {
  //     await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
  //     navigation.replace('Home');
  //     // Success: navigation will auto-redirect based on auth state
  //   } catch (e: any) {
  //     setLoginError(getFriendlyAuthError(e));
  //   } finally {
  //     setLoginLoading(false);
  //   }
  // };
  // const handleSignup = async () => {
  //   setSignupLoading(true);
  //   setSignupError('');
  //   try {
  //     await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
  //     navigation.replace('Home');
  //     // Success: navigation will auto-redirect based on auth state
  //   } catch (e: any) {
  //     setSignupError(getFriendlyAuthError(e));
  //   } finally {
  //     setSignupLoading(false);
  //   }
  // };

  // Send OTP (Expo/Firebase JS SDK)
  const handleSendOtp = async () => {
    setOtpError('');
    try {
      const phoneProvider = new (await import('firebase/auth')).PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        '+91' + phone,
        recaptchaVerifier.current
      );
      setVerificationId(verificationId);
      setAuthStep('otp');
    } catch (e: any) {
      setOtpError('Failed to send OTP. Try again.');
    }
  };

  // Verify OTP (Expo/Firebase JS SDK)
  const handleVerifyOtp = async () => {
    setOtpError('');
    try {
      const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const credential = PhoneAuthProvider.credential(verificationId!, otp);
      await signInWithCredential(auth, credential);
      navigation.replace('Home');
    } catch (e) {
      setOtpError('Invalid OTP. Try again.');
    }
  };

  // Clear errors on step change
  React.useEffect(() => {
    // setLoginError('');
    // setSignupError('');
  }, [authStep]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.light.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header with logo, illustration, and Help button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 100, backgroundColor: Colors.light.primary }}>
        {/* Logo */}
        <Image
          source={require('../../assets/images/skootyGo.png')}
          style={{
            width: 200, // Increased from 100
            height: 200, // Increased from 150
            resizeMode: 'contain',
          }}
        />
        {/* Help button */}
        {/* <TouchableOpacity style={{ backgroundColor: Colors.light.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
          <Text style={{ fontSize: 18, color: Colors.light.primary, marginRight: 2, fontWeight: 'bold' }}>?</Text>
          <Text style={{ fontSize: 16, color: Colors.light.primary, fontFamily: 'Poppins-Medium' }}>Help</Text>
        </TouchableOpacity> */}
      </View>
      {/* Main content */}
      <View style={{
        flex: 1,
        justifyContent: 'flex-start', // Move content to top
        paddingTop: 30,               // Adjust as needed
        paddingHorizontal: 28,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        backgroundColor: Colors.light.surface, // optional: to see the radius
      }}>
        {authStep === 'welcome' && (
          <>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.primary, marginBottom: 16, fontFamily: 'Poppins-Bold', letterSpacing: 0.5 }}>What's your number?</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.light.primary, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 4, marginBottom: 14, backgroundColor: Colors.light.card, shadowColor: Colors.light.primary, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
              <Text style={{ fontSize: 16, color: Colors.light.secondary, marginRight: 5, fontFamily: 'Poppins-Medium' }}>+91</Text>
              <TextInput
                style={{ flex: 1, fontSize: 16, color: Colors.light.secondary, fontFamily: 'Poppins-Medium', letterSpacing: 1 }}
                placeholder="0000000000"
                keyboardType="number-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
                placeholderTextColor={Colors.light.secondary + '99'}
              />
            </View>
            {/* CAPTCHA protected message */}
            <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: Colors.light.secondary, fontFamily: 'Poppins-Medium' }}>
                <Text style={{ fontWeight: 'bold', color: Colors.light.primary }}>CAPTCHA</Text> protected by Google
              </Text>
            </View>
            {otpError ? <Text style={{ color: '#e53935', textAlign: 'center', marginTop: 8, fontFamily: 'Poppins-Medium', fontSize: 14 }}>{otpError}</Text> : null}
          </>
        )}
        {authStep === 'otp' && (
          <View style={{ flex: 1, justifyContent: 'flex-start', paddingHorizontal: 2, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: Colors.light.surface }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.primary, marginBottom: 16, fontFamily: 'Poppins-Bold', letterSpacing: 0.5 }}>Enter OTP</Text>
            <TextInput
              style={{ fontSize: 18, color: Colors.light.secondary, fontFamily: 'Poppins-Medium', borderWidth: 1, borderColor: Colors.light.primary, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 10, marginBottom: 14, backgroundColor: Colors.light.card, shadowColor: Colors.light.primary, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3, letterSpacing: 8, textAlign: 'center' }}
              placeholder="000-000"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholderTextColor={Colors.light.secondary + '99'}
            />
            {otpError ? (
              <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 8, fontFamily: 'Poppins-Medium', fontSize: 14 }}>{otpError}</Text>
            ) : null}
            {/* Verify OTP button at the bottom */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, paddingHorizontal: 4 }}>
              <TouchableOpacity
                style={{ backgroundColor: isValidOtp ? Colors.light.primary : Colors.light.card, paddingVertical: 12, borderRadius: 12, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: 0.12, shadowRadius: 8 }}
                disabled={!isValidOtp}
                onPress={handleVerifyOtp}
              >
                <Text style={{ color: isValidOtp ? Colors.light.surface : Colors.light.secondary + '99', fontSize: 18, fontWeight: 'bold', fontFamily: 'Poppins-Bold', letterSpacing: 0.5 }}>Verify OTP</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthStep('welcome')} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ color: Colors.light.primary, textAlign: 'center', fontFamily: 'Poppins-Medium', textDecorationLine: 'underline', fontSize: 15 }}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      {/* Footer at the very bottom */}
      {authStep === 'welcome' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 10, color: Colors.light.secondary, textAlign: 'center', fontFamily: 'Poppins-Medium' }}>
            By continuing, you agree to the <Text style={{ color: Colors.light.primary, textDecorationLine: 'underline' }}>T&C</Text> and <Text style={{ color: Colors.light.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </Text>
        </View>
      )}
      {/* Next button at the bottom */}
      {authStep === 'welcome' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 60, paddingHorizontal: 24 }}>
          <TouchableOpacity
            style={{ backgroundColor: isValidPhone ? Colors.light.primary : Colors.light.card, paddingVertical: 12, borderRadius: 12, alignItems: 'center', shadowColor: Colors.light.primary, shadowOpacity: 0.12, shadowRadius: 8 }}
            disabled={!isValidPhone}
            onPress={handleSendOtp}
          >
            <Text style={{ color: isValidPhone ? Colors.light.surface : Colors.light.secondary + '99', fontSize: 18, fontWeight: 'bold', fontFamily: 'Poppins-Bold', letterSpacing: 0.5 }}>Next</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Recaptcha Modal for Expo */}
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={firebaseConfig}
      />
    </KeyboardAvoidingView>
  );
} 