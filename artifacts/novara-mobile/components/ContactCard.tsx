import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Contact } from "@/types/contact";
import { computeStatus, formatDate, isOverdue, careerFitScore } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { useColors } from "@/hooks/useColors";
import { useProfile } from "@/hooks/useProfile";
import { useContacts } from "@/hooks/useContacts";

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { profile } = useProfile();
  const { update } = useContacts();

  const isPipeline = contact.connectionStatus === "pipeline";
  const status = isPipeline ? null : computeStatus(contact.lastInteractionDate);
  const overdue = isOverdue(contact.nextFollowUpDate);
  const fitScore = careerFitScore(contact.goalTags ?? [], profile.goalTags);
  const showFit = profile.goalTags.length > 0 && fitScore > 0;

  const handleMoveToConnected = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await update(contact.id, { connectionStatus: "connected" });
  };

  return (
    <Pressable
      testID={`contact-card-${contact.id}`}
      onPress={() => router.push(`/contact/${contact.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isPipeline ? colors.primary + "30" : colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Pipeline stripe */}
      {isPipeline && (
        <View style={[styles.pipelineStripe, { backgroundColor: colors.primary }]} />
      )}

      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text
            style={[
              styles.avatarText,
              {
                color: isPipeline ? colors.primary : colors.primaryForeground,
                backgroundColor: isPipeline ? colors.primary + "18" : colors.primary,
              },
            ]}
          >
            {contact.firstName[0]}{contact.lastName[0]}
          </Text>
        </View>
        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {contact.firstName} {contact.lastName}
            </Text>
            {isPipeline && (
              <View style={[styles.pipelinePill, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <Ionicons name="paper-plane-outline" size={10} color={colors.primary} />
                <Text style={[styles.pipelinePillText, { color: colors.primary }]}>Pipeline</Text>
              </View>
            )}
          </View>
          <Text style={[styles.role, { color: colors.mutedForeground }]} numberOfLines={1}>
            {contact.role ? `${contact.role} · ` : ""}{contact.company}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </View>

      <View style={styles.meta}>
        <View style={styles.metaLeft}>
          <Ionicons
            name={isPipeline ? "send-outline" : "location-outline"}
            size={13}
            color={colors.mutedForeground}
          />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {contact.metAt ?? "—"}
          </Text>
        </View>
        <View style={styles.badges}>
          {showFit && (
            <View
              style={[
                styles.fitBadge,
                {
                  backgroundColor:
                    fitScore >= 75
                      ? colors.warm + "20"
                      : fitScore >= 50
                      ? colors.primary + "15"
                      : colors.coolingBg,
                  borderColor:
                    fitScore >= 75
                      ? colors.warm + "50"
                      : fitScore >= 50
                      ? colors.primary + "40"
                      : colors.cooling + "50",
                },
              ]}
            >
              <Text
                style={[
                  styles.fitBadgeText,
                  {
                    color:
                      fitScore >= 75
                        ? colors.warmText
                        : fitScore >= 50
                        ? colors.primary
                        : colors.coolingText,
                  },
                ]}
              >
                ✦ {fitScore}%
              </Text>
            </View>
          )}
          <ImportanceBadge importance={contact.importance} size="sm" />
          {status && <StatusBadge status={status} size="sm" />}
        </View>
      </View>

      <View style={[styles.followUpRow, { borderTopColor: colors.border }]}>
        <Ionicons
          name={overdue ? "alert-circle-outline" : isPipeline ? "paper-plane-outline" : "calendar-outline"}
          size={13}
          color={overdue ? colors.cold : colors.mutedForeground}
        />
        <Text style={[styles.followUpText, { color: overdue ? colors.cold : colors.mutedForeground }]}>
          {overdue
            ? `Overdue · ${formatDate(contact.nextFollowUpDate)}`
            : isPipeline
            ? `Reach out · ${formatDate(contact.nextFollowUpDate)}`
            : `Follow up · ${formatDate(contact.nextFollowUpDate)}`}
        </Text>
      </View>

      {isPipeline && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            handleMoveToConnected();
          }}
          style={({ pressed }) => [
            styles.connectBtn,
            {
              backgroundColor: pressed ? colors.warm + "25" : colors.warm + "15",
              borderTopColor: colors.warm + "30",
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={15} color={colors.warmText} />
          <Text style={[styles.connectBtnText, { color: colors.warmText }]}>
            Mark as Connected
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  pipelineStripe: {
    height: 3,
    width: "100%",
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarText: {
    width: 44,
    height: 44,
    textAlign: "center",
    lineHeight: 44,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  nameBlock: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  pipelinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
  },
  pipelinePillText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold" },
  role: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  metaLeft: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  metaText: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  badges: { flexDirection: "row", gap: 6, alignItems: "center" },
  fitBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  fitBadgeText: { fontSize: 11, fontFamily: "PlusJakartaSans_700Bold" },
  followUpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  followUpText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium" },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  connectBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
