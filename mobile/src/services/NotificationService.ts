import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage keys for the per-event toggles shown in Settings.
export const NOTIF_LOW_STOCK_KEY = '@pos_notif_low_stock';
export const NOTIF_SALE_KEY = '@pos_notif_sale_completed';
export const NOTIF_DAILY_KEY = '@pos_notif_daily_summary';

const LOW_STOCK_THRESHOLD_KEY = '@pos_low_stock_threshold';
const DAILY_SUMMARY_ID = 'daily-summary';
const DAILY_SUMMARY_HOUR = 20; // 8:00 PM

let handlerConfigured = false;

class NotificationService {
  // Call once at app startup — installs the foreground handler + Android channel.
  async configure() {
    if (handlerConfigured) return;
    handlerConfigured = true;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      } catch {}
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') return true;
      const requested = await Notifications.requestPermissionsAsync();
      return requested.status === 'granted';
    } catch {
      return false;
    }
  }

  private async isEnabled(key: string, defaultOn: boolean): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value === null) return defaultOn;
      return value !== 'false';
    } catch {
      return defaultOn;
    }
  }

  // Fired after a sale when a sold product's remaining stock is at/below the
  // configured low-stock threshold. Enabled by default.
  async checkLowStock(productName: string, remainingQty: number) {
    if (!(await this.isEnabled(NOTIF_LOW_STOCK_KEY, true))) return;

    let threshold = 10;
    try {
      const raw = await AsyncStorage.getItem(LOW_STOCK_THRESHOLD_KEY);
      const parsed = parseInt(raw || '10', 10);
      if (!isNaN(parsed) && parsed > 0) threshold = parsed;
    } catch {}

    if (remainingQty > threshold) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Low Stock Alert',
          body: `${productName} is running low — ${Math.max(remainingQty, 0)} left.`,
        },
        trigger: null,
      });
    } catch {}
  }

  // Fired after a successful sale. Disabled by default.
  async notifySaleCompleted(amount: number) {
    if (!(await this.isEnabled(NOTIF_SALE_KEY, false))) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Sale Completed',
          body: `A sale of ₦${amount.toLocaleString()} was processed.`,
        },
        trigger: null,
      });
    } catch {}
  }

  // A repeating local reminder at 8 PM. Disabled by default.
  async scheduleDailySummary() {
    await this.cancelDailySummary();
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_SUMMARY_ID,
        content: {
          title: 'Daily Sales Summary',
          body: 'Open JayPOS to review today’s sales.',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: DAILY_SUMMARY_HOUR,
          minute: 0,
        },
      });
    } catch {}
  }

  async cancelDailySummary() {
    try {
      await Notifications.cancelScheduledNotificationAsync(DAILY_SUMMARY_ID);
    } catch {}
  }

  // Re-apply the daily-summary schedule from the stored toggle. Call at startup.
  async syncScheduled() {
    if (await this.isEnabled(NOTIF_DAILY_KEY, false)) {
      await this.scheduleDailySummary();
    } else {
      await this.cancelDailySummary();
    }
  }
}

export default new NotificationService();
