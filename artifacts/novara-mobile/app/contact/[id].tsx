import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useContacts } from "@/hooks/useContacts";
import { Contact } from "@/types/contact";
import { computeStatus, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { scheduleFollowUpReminder, scheduleDailyDigest, requestNotificationPermission } from "@/lib/notifications";
import { addFollowUpToCalendar } from "@/lib/calendar";
import { getCompanyNews, type Headline } from "@/lib/api";

type NewsStatus = "idle" | "loading" | "ok" | "empty" | "error";

export default function ContactDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts, markContacted, remove } = useContacts();
  const [marking, setMarking] = useState(false);
  const [addingCalendar, setAddingCalendar] = useState(false);
  const [schedulingNotif, setSchedulingNotif] = useState(false);
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [newsStatus, setNewsStatus] = useState<NewsStatus>("idle");
  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;

  const contact = contacts.find((c) => c.id === id);
  const status = contact ? computeStatus(contact.lastInteractionDate) : null;

  useEffect(() => {
    if (!contact?.company) return;
    let cancelled = false;
    setNewsStatus("loading");
    getCompanyNews(contact.company)
      .then((data) => {
        if (cancelled) return;
        setHeadlines(data.headlines ?? []);
        setNewsStatus(data.headlines?.length > 0 ? "ok" : "empty");
      })
      .catch(() => {
        if (cancelled) return;
        setNewsStatus("error");
      });
    return () => { cancelled = true; };
  }, [contact?.company]);

  const handleMarkContacted = async () => {
    if (!contact) return;
    setMarking(true);
    await markContacted(contact.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMarking(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Contact",
      `Remove ${contact?.firstName} ${contact?.lastName} from your network?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (contact) {
              await remove(contact.id);
              router.back();
            }
          },
        },
      ]
    );
  };

  const handleLinkedIn = () => {
    if (contact?.linkedinUrl) {
      const url = contact.linkedinUrl.startsWith("http")
        ? contact.linkedinUrl
        : `https://${contact.linkedinUrl}`;
      Linking.openURL(url);
    }
  };

  const handleEmail = () => {
    if (contact?.email) Linking.openURL(`mailto:${contact.email}`);
  };

  const handlePhone = () => {
    if (contact?.phone) Linking.openURL(`tel:${contact.phone}`);
  };

  const handleAddToCalendar = async () => {
    if (!contact || Platform.OS === "web") return;
    setAddingCalendar(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const success = await addFollowUpToCalendar(
        `${contact.firstName} ${contact.lastName}`,
        new Date(contact.nextFollowUpDate),
        contact.notes
      );
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Added to Calendar", `Follow-up with ${contact.firstName} added for ${formatDate(contact.nextFollowUpDate)}.`);
      }
    } catch {
      Alert.alert("Error", "Could not add to calendar.");
    } finally {
      setAddingCalendar(false);
    }
  };

  const handleScheduleNotification = async () => {
    if (!contact || Platform.OS === "web") return;
    setSchedulingNotif(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert("Permission needed", "Please allow notifications in Settings to receive follow-up reminders.");
        return;
      }
      const notifId = await scheduleFollowUpReminder(
        contact.id,
        `${contact.firstName} ${contact.lastName}`,
        new Date(contact.nextFollowUpDate)
      );
      if (notifId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Reminder set ✓", `You'll get a notification on ${formatDate(contact.nextFollowUpDate)} at 9:00 AM.`);
      } else {
        Alert.alert("Note", "The follow-up date has already passed — mark as contacted to reset it.");
      }
    } catch {
      Alert.alert("Error", "Could not schedule reminder.");
    } finally {
      setSchedulingNotif(false);
    }
  };

  if (!contact) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      {/* Custom header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + topPaddingWeb + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable testID="button-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            testID="button-edit"
            onPress={() => router.push(`/contact/edit/${contact.id}`)}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="pencil-outline" size={20} color={colors.foreground} />
          </Pressable>
          <Pressable
            testID="button-delete"
            onPress={handleDelete}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>
              {contact.firstName[0]}{contact.lastName[0]}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {contact.firstName} {contact.lastName}
          </Text>
          <Text style={[styles.roleCompany, { color: colors.mutedForeground }]}>
            {contact.role ? `${contact.role} · ` : ""}{contact.company}
          </Text>
          <View style={styles.badgeRow}>
            {status && <StatusBadge status={status} />}
            <ImportanceBadge importance={contact.importance} />
          </View>
        </View>

        {/* Mark contacted */}
        <Pressable
          testID="button-mark-contacted"
          onPress={handleMarkContacted}
          disabled={marking}
          style={({ pressed }) => [
            styles.markBtn,
            { backgroundColor: colors.primary, opacity: pressed || marking ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.primaryForeground} />
          <Text style={[styles.markBtnText, { color: colors.primaryForeground }]}>
            {marking ? "Updating..." : "Mark as Contacted Today"}
          </Text>
        </Pressable>

        {/* Calendar + Notifications row */}
        {Platform.OS !== "web" && (
          <View style={styles.actionRow}>
            <Pressable
              testID="button-add-calendar"
              onPress={handleAddToCalendar}
              disabled={addingCalendar}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || addingCalendar ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>
                {addingCalendar ? "Adding…" : "Add to Calendar"}
              </Text>
            </Pressable>
            <Pressable
              testID="button-set-reminder"
              onPress={handleScheduleNotification}
              disabled={schedulingNotif}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || schedulingNotif ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>
                {schedulingNotif ? "Setting…" : "Set Reminder"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Info cards */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow
            icon="calendar-outline"
            label="Last Interaction"
            value={formatDate(contact.lastInteractionDate)}
            colors={colors}
          />
          <Divider color={colors.border} />
          <InfoRow
            icon="alarm-outline"
            label="Next Follow-up"
            value={formatDate(contact.nextFollowUpDate)}
            colors={colors}
          />
          <Divider color={colors.border} />
          <View style={styles.timingRow}>
            <View style={styles.timingBox}>
              <View style={styles.timingLabelRow}>
                <Ionicons name="timer-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.timingLabel, { color: colors.mutedForeground }]}>First reach-out</Text>
              </View>
              <Text style={[styles.timingValue, { color: colors.foreground }]}>
                {contact.initialFollowUpDays === 1 ? "1 day" : `${contact.initialFollowUpDays} days`}
              </Text>
              <Text style={[styles.timingSubtext, { color: colors.mutedForeground }]}>after meeting</Text>
            </View>
            <View style={[styles.timingDivider, { backgroundColor: colors.border }]} />
            <View style={styles.timingBox}>
              <View style={styles.timingLabelRow}>
                <Ionicons name="refresh-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.timingLabel, { color: colors.mutedForeground }]}>Ongoing cadence</Text>
              </View>
              <Text style={[styles.timingValue, { color: colors.foreground }]}>
                {contact.followUpCadenceDays === 14 ? "Every 2 wks" : contact.followUpCadenceDays === 30 ? "Every month" : contact.followUpCadenceDays === 60 ? "Every 2 mo" : "Every 3 mo"}
              </Text>
              <Text style={[styles.timingSubtext, { color: colors.mutedForeground }]}>once connected</Text>
            </View>
          </View>
          <Divider color={colors.border} />
          <InfoRow
            icon="location-outline"
            label="Where We Met"
            value={contact.metAt ?? "—"}
            colors={colors}
          />
        </View>

        {contact.linkedinUrl && (
          <Pressable
            testID="button-linkedin"
            onPress={handleLinkedIn}
            style={({ pressed }) => [
              styles.linkedinBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="logo-linkedin" size={20} color="#0077b5" />
            <Text style={[styles.linkedinText, { color: "#0077b5" }]}>View LinkedIn Profile</Text>
            <Ionicons name="open-outline" size={16} color="#0077b5" />
          </Pressable>
        )}

        {contact.email && (
          <Pressable
            testID="button-email"
            onPress={handleEmail}
            style={({ pressed }) => [
              styles.linkedinBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={[styles.linkedinText, { color: colors.primary }]}>{contact.email}</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
        )}

        {contact.phone && (
          <Pressable
            testID="button-phone"
            onPress={handlePhone}
            style={({ pressed }) => [
              styles.linkedinBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="call-outline" size={20} color={colors.primary} />
            <Text style={[styles.linkedinText, { color: colors.primary }]}>{contact.phone}</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
        )}

        {/* Conversation Starters — live news */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.newsSectionHeader}>
            <Ionicons name="newspaper-outline" size={15} color={colors.primary} />
            <Text style={[styles.newsSectionTitle, { color: colors.mutedForeground }]}>CONVERSATION STARTERS</Text>
          </View>
          <Text style={[styles.newsSectionSubtitle, { color: colors.mutedForeground }]}>
            Use recent {contact.company} news to reconnect naturally.
          </Text>

          {newsStatus === "loading" && (
            <View style={styles.newsStateRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.newsStateText, { color: colors.mutedForeground }]}>Fetching latest news…</Text>
            </View>
          )}

          {newsStatus === "error" && (
            <Text style={[styles.newsStateText, { color: colors.mutedForeground }]}>Couldn't load news right now.</Text>
          )}

          {newsStatus === "empty" && (
            <Text style={[styles.newsStateText, { color: colors.mutedForeground }]}>No recent company news found.</Text>
          )}

          {newsStatus === "ok" && headlines.map((h, i) => (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(h.url)}
              style={({ pressed }) => [
                styles.newsItem,
                { backgroundColor: pressed ? colors.primary + "0d" : colors.background, borderColor: colors.border },
              ]}
            >
              <View style={styles.newsItemIcon}>
                <Ionicons name="open-outline" size={11} color={colors.primary} />
              </View>
              <View style={styles.newsItemContent}>
                <Text style={[styles.newsItemTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {h.title}
                </Text>
                {(h.source || h.publishedAt) && (
                  <Text style={[styles.newsItemMeta, { color: colors.mutedForeground }]}>
                    {h.source}
                    {h.source && h.publishedAt ? " · " : ""}
                    {h.publishedAt
                      ? new Date(h.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : ""}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}

          <Text style={[styles.newsPoweredBy, { color: colors.mutedForeground + "80" }]}>
            Updates every 6 hours · Google News
          </Text>
        </View>

        {contact.notes ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>NOTES</Text>
            <Text style={[styles.notesText, { color: colors.foreground }]}>{contact.notes}</Text>
          </View>
        ) : null}

        <Text style={[styles.addedOn, { color: colors.mutedForeground }]}>
          Added {formatDate(contact.createdAt)}
        </Text>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={colors.mutedForeground} />
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: { padding: 8 },
  content: { padding: 20, gap: 14 },
  hero: { alignItems: "center", gap: 8, paddingVertical: 8 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  name: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
  },
  roleCompany: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  markBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  divider: { height: 1, marginHorizontal: 16 },
  linkedinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  linkedinText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  notesLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 1.5,
    padding: 16,
    paddingBottom: 8,
  },
  notesText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  addedOn: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  timingRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timingBox: { flex: 1, gap: 3 },
  timingDivider: { width: 1, marginVertical: 2, marginHorizontal: 12 },
  timingLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  timingLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  timingValue: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold" },
  timingSubtext: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular" },
  // News / Conversation Starters
  newsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 16,
    paddingBottom: 4,
  },
  newsSectionTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 1.5,
  },
  newsSectionSubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  newsStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  newsStateText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  newsItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  newsItemIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  newsItemContent: { flex: 1, gap: 3 },
  newsItemTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    lineHeight: 18,
  },
  newsItemMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  newsPoweredBy: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
});
