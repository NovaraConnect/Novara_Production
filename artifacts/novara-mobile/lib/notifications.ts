import { Platform } from "react-native";

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const Notifications = await import("expo-notifications");
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleFollowUpReminder(
  contactId: string,
  contactName: string,
  followUpDate: Date
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const Notifications = await import("expo-notifications");

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const trigger = new Date(followUpDate);
  trigger.setHours(9, 0, 0, 0);
  if (trigger <= new Date()) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to reach out 👋",
      body: `You're due to follow up with ${contactName}`,
      data: { contactId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
  return id;
}

export async function scheduleDailyDigest(): Promise<string> {
  if (Platform.OS === "web") return "";
  const Notifications = await import("expo-notifications");
  await cancelDailyDigest();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your network check-in 📋",
      body: "See who needs a follow-up today in Novara",
      data: { type: "daily_digest" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  });
  return id;
}

export async function cancelDailyDigest(): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = await import("expo-notifications");
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as { type?: string })?.type === "daily_digest") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
