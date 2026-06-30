import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

/**
 * Requests camera permission using expo-camera.
 * @returns {Promise<boolean>} true if permission was granted, false otherwise.
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await Camera.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Requests photo library permission using expo-image-picker.
 * @returns {Promise<boolean>} true if permission was granted, false otherwise.
 */
export async function requestPhotoLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}
