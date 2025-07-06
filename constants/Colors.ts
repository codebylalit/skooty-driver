/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    background: '#E7D7C9', // New background
    primary: '#CC5803',     // Action color
    secondary: '#582b11',   // Text, headings, nav
    surface: '#FAF6F3',     // Cards
    accent: '#CC5803',      // Use primary as accent for minimalism
    card: '#FFFFFF',        // Use surface for cards
    text: '#582b11',        // Secondary for text
    tint: '#CC5803',        // Primary for tint
    icon: '#CC5803',        // Primary for icons
    tabIconDefault: '#582b11',
    tabIconSelected: '#CC5803',
  },
  dark: {
    background: '#582b11', // Secondary as dark background
    primary: '#CC5803',    // Action color
    secondary: '#E7D7C9',  // Light text
    surface: '#222',       // Dark card
    accent: '#CC5803',     // Primary as accent
    card: '#222',
    text: '#E7D7C9',       // Light text
    tint: '#CC5803',
    icon: '#CC5803',
    tabIconDefault: '#E7D7C9',
    tabIconSelected: '#CC5803',
  },
};
