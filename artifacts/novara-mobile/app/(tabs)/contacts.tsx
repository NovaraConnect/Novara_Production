import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useContacts } from "@/hooks/useContacts";
import { computeStatus } from "@/lib/utils";
import { ContactCard } from "@/components/ContactCard";
import { RelationshipStatus } from "@/types/contact";

const STATUS_FILTERS: Array<RelationshipStatus | "All"> = ["All", "Warm", "Cooling", "Cold"];

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contacts, loading } = useContacts();
  const [activeTab, setActiveTab] = useState<"connected" | "pipeline">("connected");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RelationshipStatus | "All">("All");

  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;

  const connected = useMemo(() => contacts.filter((c) => c.connectionStatus === "connected"), [contacts]);
  const pipeline = useMemo(() => contacts.filter((c) => c.connectionStatus === "pipeline"), [contacts]);

  const filtered = useMemo(() => {
    const pool = activeTab === "connected" ? connected : pipeline;
    return pool.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        (c.role ?? "").toLowerCase().includes(q) ||
        (c.metAt ?? "").toLowerCase().includes(q);
      const matchesStatus =
        activeTab === "pipeline" ||
        statusFilter === "All" ||
        computeStatus(c.lastInteractionDate) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contacts, activeTab, search, statusFilter]);

  const handleTabChange = (tab: "connected" | "pipeline") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    setSearch("");
    setStatusFilter("All");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + topPaddingWeb + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Contacts</Text>

        {/* Segment control */}
        <View style={[styles.segmentWrap, { backgroundColor: colors.muted }]}>
          <Pressable
            style={[
              styles.segmentBtn,
              activeTab === "connected" && [styles.segmentActive, { backgroundColor: colors.card }],
            ]}
            onPress={() => handleTabChange("connected")}
          >
            <Ionicons
              name="people"
              size={14}
              color={activeTab === "connected" ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.segmentText,
                { color: activeTab === "connected" ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Connected
            </Text>
            <View
              style={[
                styles.countPill,
                { backgroundColor: activeTab === "connected" ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.countPillText, { color: activeTab === "connected" ? colors.primaryForeground : colors.mutedForeground }]}>
                {connected.length}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.segmentBtn,
              activeTab === "pipeline" && [styles.segmentActive, { backgroundColor: colors.card }],
            ]}
            onPress={() => handleTabChange("pipeline")}
          >
            <Ionicons
              name="paper-plane-outline"
              size={14}
              color={activeTab === "pipeline" ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.segmentText,
                { color: activeTab === "pipeline" ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Pipeline
            </Text>
            <View
              style={[
                styles.countPill,
                { backgroundColor: activeTab === "pipeline" ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.countPillText, { color: activeTab === "pipeline" ? colors.primaryForeground : colors.mutedForeground }]}>
                {pipeline.length}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            testID="input-search"
            placeholder={activeTab === "connected" ? "Search connected contacts..." : "Search pipeline..."}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "PlusJakartaSans_400Regular" }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Status filters — only for Connected tab */}
        {activeTab === "connected" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
            <View style={styles.filters}>
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f;
                return (
                  <Pressable
                    key={f}
                    testID={`filter-${f}`}
                    onPress={() => setStatusFilter(f)}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        { color: active ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Pipeline hint */}
        {activeTab === "pipeline" && (
          <Text style={[styles.pipelineHint, { color: colors.mutedForeground }]}>
            People you've reached out to but haven't yet connected with.
          </Text>
        )}
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name={activeTab === "connected" ? "people-outline" : "paper-plane-outline"}
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === "connected" ? "No contacts found" : "Pipeline is empty"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search
                ? "Try a different search term"
                : activeTab === "connected"
                ? "Add your first contact to get started"
                : "Add contacts you're actively trying to connect with"}
            </Text>
          </View>
        ) : (
          filtered.map((contact) => <ContactCard key={contact.id} contact={contact} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
  },
  segmentWrap: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 100,
    minWidth: 20,
    alignItems: "center",
  },
  countPillText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filtersScroll: { marginHorizontal: -20 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  pipelineHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 17,
    marginTop: -4,
  },
  list: { padding: 20 },
  empty: { alignItems: "center", gap: 8, marginTop: 60 },
  emptyTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", marginTop: 8 },
  emptyText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center" },
});
