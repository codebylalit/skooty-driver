import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { View } from 'react-native';
import DriverHistoryScreen from './driver/DriverHistoryScreen';
import DriverHomeScreen from './driver/DriverHomeScreen';
import DriverLoginScreen from './driver/DriverLoginScreen';
import DriverRegisterScreen from './driver/DriverRegisterScreen';
import DriverRideStatusScreen from './driver/DriverRideStatusScreen';
const Stack = createStackNavigator();

export default function DriverApp() {
  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator initialRouteName="DriverLogin">
        <Stack.Screen
          name="DriverLogin"
          component={DriverLoginScreen}
        />
        <Stack.Screen
          name="DriverRegister"
          component={DriverRegisterScreen}
        />
        <Stack.Screen
          name="DriverHome"
          component={DriverHomeScreen}
        />
        <Stack.Screen
          name="DriverRideStatus"
          component={DriverRideStatusScreen}
        />
        <Stack.Screen name="DriverHistory" component={DriverHistoryScreen} />
      </Stack.Navigator>
    </View>
  );
} 