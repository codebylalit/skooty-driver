# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

# Push Notifications for New Ride Requests

This app uses Expo push notifications to alert drivers when a new ride request matching their vehicle type is created, even if the app is in the background or closed.

## How it works

1. **Driver App Registration**
   - The driver app registers for push notifications using Expo and saves the device's Expo push token to the driver's Firestore document.

2. **Cloud Function (Backend)**
   - A Firebase Cloud Function listens for new ride documents in Firestore.
   - When a new ride is created, it finds all eligible drivers (matching vehicle type, verified, etc.) and sends a push notification to their Expo tokens using the Expo push API.

3. **Notification Handling**
   - When the driver receives a notification and taps it, the app can navigate to the ride status screen or refresh the ride list.

## Setup Required

- The driver app must be run on a physical device (not a simulator) to receive push notifications.
- The Firebase Cloud Function must be deployed and configured with appropriate permissions.
- See `app/driver/DriverHomeScreen.tsx` for the push token registration logic.
- See the provided sample Cloud Function in the documentation or ask the team for the latest version.
