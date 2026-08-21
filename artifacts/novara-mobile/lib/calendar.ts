import { Platform, Alert } from "react-native";

export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const Calendar = await import("expo-calendar");
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

export async function addFollowUpToCalendar(
  contactName: string,
  followUpDate: Date,
  notes?: string
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const Calendar = await import("expo-calendar");

  const granted = await requestCalendarPermission();
  if (!granted) {
    Alert.alert("Permission needed", "Please allow calendar access in Settings to add reminders.");
    return false;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  const calendarId = writable[0]?.id ?? null;

  if (!calendarId) {
    Alert.alert("No calendar found", "No writable calendar available on this device.");
    return false;
  }

  const startDate = new Date(followUpDate);
  startDate.setHours(9, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setHours(9, 30, 0, 0);

  await Calendar.createEventAsync(calendarId, {
    title: `Follow up with ${contactName}`,
    startDate,
    endDate,
    notes: notes ?? `Scheduled via Novara`,
    alarms: [{ relativeOffset: -60 }],
  });

  return true;
}
