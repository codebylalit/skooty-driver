import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { auth } from '../../firebaseConfig';

interface WelcomeScreenProps {
  navigation: any;
}

type AuthStep = 'welcome' | 'login' | 'signup';

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

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const [authStep, setAuthStep] = useState<AuthStep>('welcome');
  // Welcome (phone)
  const [phone, setPhone] = useState('');
  const isValidPhone = /^\d{10}$/.test(phone);
  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Signup
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState('');

  // Auth handlers
  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
            navigation.replace('Home');

      // Success: navigation will auto-redirect based on auth state
    } catch (e: any) {
      setLoginError(getFriendlyAuthError(e));
    } finally {
      setLoginLoading(false);
    }
  };
  const handleSignup = async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
            navigation.replace('Home');
      // Success: navigation will auto-redirect based on auth state
    } catch (e: any) {
      setSignupError(getFriendlyAuthError(e));
    } finally {
      setSignupLoading(false);
    }
  };
  

  // Clear errors on step change
  React.useEffect(() => {
    setLoginError('');
    setSignupError('');
  }, [authStep]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.light.background, justifyContent: 'center', paddingHorizontal: 24 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Logo */}
      <View style={{ alignItems: 'center', marginTop: 48, marginBottom: 32 }}>
        <Text style={{ fontSize: 40, fontWeight: '900', color: Colors.light.primary, marginBottom: 8, fontFamily: 'Inter', letterSpacing: 1 }}>skooty</Text>
      </View>

      {/* Auth Step Switcher */}
      {authStep === 'welcome' && (
        <View style={{ backgroundColor: Colors.light.card, borderRadius: 28, shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 12, padding: 32, marginBottom: 32 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, marginBottom: 18, fontFamily: 'Inter' }}>What&apos;s your number?</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.light.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, backgroundColor: Colors.light.background }}>
            <Text style={{ fontSize: 18, color: Colors.light.secondary, marginRight: 8, fontFamily: 'Inter' }}>+91</Text>
          <TextInput
              style={{ flex: 1, fontSize: 18, color: Colors.light.secondary, fontFamily: 'Inter' }}
            placeholder="0000000000"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
              placeholderTextColor={Colors.light.secondary + '99'}
            />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: isValidPhone ? Colors.light.primary : Colors.light.surface, paddingVertical: 16, borderRadius: 16, marginTop: 18, alignItems: 'center' }}
            disabled={!isValidPhone}
            onPress={() => setAuthStep('login')}
          >
            <Text style={{ color: isValidPhone ? Colors.light.surface : Colors.light.secondary + '99', fontSize: 18, fontWeight: 'bold', fontFamily: 'Inter' }}>Next</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: Colors.light.secondary + '99', marginTop: 18, textAlign: 'center', fontFamily: 'Inter' }}>
            By continuing, you agree to the <Text style={{ color: Colors.light.primary, textDecorationLine: 'underline' }}>T&C</Text> and <Text style={{ color: Colors.light.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </Text>
          <TouchableOpacity onPress={() => setAuthStep('login')} style={{ marginTop: 18 }}>
            <Text style={{ color: Colors.light.primary, textAlign: 'center', fontFamily: 'Inter', textDecorationLine: 'underline' }}>Login with Email</Text>
          </TouchableOpacity>
        </View>
      )}

      {authStep === 'login' && (
        <View style={{ backgroundColor: Colors.light.card, borderRadius: 28, shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 12, padding: 32, marginBottom: 32 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, marginBottom: 18, fontFamily: 'Inter' }}>Login</Text>
          <TextInput
            style={{ fontSize: 18, color: Colors.light.secondary, fontFamily: 'Inter', borderWidth: 1, borderColor: Colors.light.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, backgroundColor: Colors.light.background }}
            placeholder="Email"
            value={loginEmail}
            onChangeText={setLoginEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={Colors.light.secondary + '99'}
          />
          <TextInput
            style={{ fontSize: 18, color: Colors.light.secondary, fontFamily: 'Inter', borderWidth: 1, borderColor: Colors.light.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, backgroundColor: Colors.light.background }}
            placeholder="Password"
            value={loginPassword}
            onChangeText={setLoginPassword}
            secureTextEntry
            placeholderTextColor={Colors.light.secondary + '99'}
          />
          {loginError ? (
            <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 8, fontFamily: 'Inter', fontSize: 14 }}>{loginError}</Text>
          ) : null}
          <TouchableOpacity
            style={{ backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, marginTop: 8, alignItems: 'center' }}
            onPress={handleLogin}
            disabled={loginLoading}
          >
            <Text style={{ color: Colors.light.surface, fontSize: 18, fontWeight: 'bold', fontFamily: 'Inter' }}>{loginLoading ? 'Logging in...' : 'Login'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthStep('signup')} style={{ marginTop: 18 }}>
            <Text style={{ color: Colors.light.primary, textAlign: 'center', fontFamily: 'Inter', textDecorationLine: 'underline' }}>Don&apos;t have an account? Sign up</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthStep('welcome')} style={{ marginTop: 8 }}>
            <Text style={{ color: Colors.light.secondary + '99', textAlign: 'center', fontFamily: 'Inter', textDecorationLine: 'underline' }}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {authStep === 'signup' && (
        <View style={{ backgroundColor: Colors.light.card, borderRadius: 28, shadowColor: Colors.light.primary, shadowOpacity: 0.08, shadowRadius: 12, padding: 32, marginBottom: 32 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: Colors.light.secondary, marginBottom: 18, fontFamily: 'Inter' }}>Sign Up</Text>
          <TextInput
            style={{ fontSize: 18, color: Colors.light.secondary, fontFamily: 'Inter', borderWidth: 1, borderColor: Colors.light.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, backgroundColor: Colors.light.background }}
            placeholder="Email"
            value={signupEmail}
            onChangeText={setSignupEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={Colors.light.secondary + '99'}
          />
          <TextInput
            style={{ fontSize: 18, color: Colors.light.secondary, fontFamily: 'Inter', borderWidth: 1, borderColor: Colors.light.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, backgroundColor: Colors.light.background }}
            placeholder="Password"
            value={signupPassword}
            onChangeText={setSignupPassword}
            secureTextEntry
            placeholderTextColor={Colors.light.secondary + '99'}
          />
          {signupError ? (
            <Text style={{ color: '#e53935', textAlign: 'center', marginBottom: 8, fontFamily: 'Inter', fontSize: 14 }}>{signupError}</Text>
          ) : null}
        <TouchableOpacity
            style={{ backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, marginTop: 8, alignItems: 'center' }}
            onPress={handleSignup}
            disabled={signupLoading}
          >
            <Text style={{ color: Colors.light.surface, fontSize: 18, fontWeight: 'bold', fontFamily: 'Inter' }}>{signupLoading ? 'Signing up...' : 'Sign Up'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthStep('login')} style={{ marginTop: 18 }}>
            <Text style={{ color: Colors.light.primary, textAlign: 'center', fontFamily: 'Inter', textDecorationLine: 'underline' }}>Already have an account? Login</Text>
        </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthStep('welcome')} style={{ marginTop: 8 }}>
            <Text style={{ color: Colors.light.secondary + '99', textAlign: 'center', fontFamily: 'Inter', textDecorationLine: 'underline' }}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
    </KeyboardAvoidingView>
  );
} 