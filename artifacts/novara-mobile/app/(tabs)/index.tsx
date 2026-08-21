import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useContacts } from "@/hooks/useContacts";
import { computeStatus, computeHealthScore, formatDate, isOverdue } from "@/lib/utils";
import { ContactCard } from "@/components/ContactCard";
import { HealthRing } from "@/components/HealthRing";

export default function Dashboard() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts, loading, refresh } = useContacts();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const connected = contacts.filter((c) => c.connectionStatus === "connected");
  const pipeline = contacts.filter((c) => c.connectionStatus === "pipeline");

  const healthScore = computeHealthScore(connected);

  const stats = connected.reduce(
    (acc, c) => {
      const s = computeStatus(c.lastInteractionDate);
      acc[s]++;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0 }
  );

  const dueNow = contacts
    .filter((c) => isOverdue(c.nextFollowUpDate))
    .sort((a, b) => new Date(a.nextFollowUpDate).getTime() - new Date(b.nextFollowUpDate).getTime());

  const pipelineDue = pipeline.filter((c) => isOverdue(c.nextFollowUpDate));

  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + topPaddingWeb + 16, paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.appName, { color: colors.foreground }]}>Project Novara</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Your professional network, curated.
          </Text>
        </View>
        <Pressable
          testID="button-add-contact"
          onPress={() => router.push("/(tabs)/add")}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.primaryForeground} />
        </Pressable>
      </View>

      {/* Health Score — connected contacts only */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          NETWORK HEALTH · {connected.length} CONNECTED
        </Text>
        <HealthRing score={healthScore} />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: "Warm", value: stats.Warm, color: colors.warmText, bg: colors.warmBg },
          { label: "Cooling", value: stats.Cooling, color: colors.coolingText, bg: colors.coolingBg },
          { label: "Cold", value: stats.Cold, color: colors.coldText, bg: colors.coldBg },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, { backgroundColor: stat.bg, borderColor: colors.border }]}
          >
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: stat.color }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Pipeline row — tap to navigate */}
      {pipeline.length > 0 && (
        <Pressable
          onPress={() => router.push("/(tabs)/contacts")}
          style={({ pressed }) => [
            styles.pipelineCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary + "30",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.pipelineIcon, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="paper-plane-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.pipelineInfo}>
            <Text style={[styles.pipelineTitle, { color: colors.foreground }]}>
              {pipeline.length} in Pipeline
            </Text>
            <Text style={[styles.pipelineSub, { color: colors.mutedForeground }]}>
              {pipelineDue.length > 0
                ? `${pipelineDue.length} due for follow-up`
                : "Contacts you're reaching out to"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      )}

      {/* Needs Attention */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Needs Attention</Text>
          <View style={[styles.badge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {dueNow.length} due
            </Text>
          </View>
        </View>

        {dueNow.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle-outline" size={36} color={colors.warm} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No follow-ups pending right now.
            </Text>
          </View>
        ) : (
          dueNow.map((contact) => <ContactCard key={contact.id} contact={contact} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  appName: { fontSize: 26, fontFamily: "PlusJakartaSans_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    gap: 20,
  },
  sectionLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 1.5 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  statLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pipelineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  pipelineIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pipelineInfo: { flex: 1 },
  pipelineTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  pipelineSub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  section: { marginBottom: 20, marginTop: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  badgeText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium" },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", marginTop: 4 },
  emptyText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center" },
});
