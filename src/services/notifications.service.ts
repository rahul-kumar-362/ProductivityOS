import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { isTauri } from './tauri';

/** Native desktop notification (permission requested on first use). */
export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch (e) {
    console.error('[notify]', e);
  }
}
