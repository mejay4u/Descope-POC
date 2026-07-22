/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
// expo-dev-client (npx expo run:ios/android) launches the component named
// "main" rather than the app.json name — register both so either CLI works.
AppRegistry.registerComponent('main', () => App);
