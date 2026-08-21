import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useProfile } from "@/hooks/useProfile";

export default function Settings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;

  const { profile, loading, update } = useProfile();

  const [statement, setStatement] = useState("");
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) {
      setStatement(profile.careerStatement);
    }
  }, [loading]);

  const handleSaveStatement = async () => {
    await update({ careerStatement: statement.trim() });
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (profile.goalTags.includes(trimmed)) {
      Alert.alert("Tag exists", `"${trimmed}" is already in your goal tags.`);
      return;
    }
    await update({ goalTags: [...profile.goalTags, trimmed] });
    setNewTag("");
    setShowTagInput(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveTag = async (tag: string) => {
    await update({ goalTags: profile.goalTags.filter((t) => t !== tag) });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + topPaddingWeb + 16, paddingBottom: insets.bottom + 100 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

      {/* App identity */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
          <Ionicons name="people" size={28} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>Project Novara</Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Never let an important professional relationship go cold.
        </Text>
        <View style={[styles.versionBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.versionText, { color: colors.mutedForeground }]}>v1.0 · MVP</Text>
        </View>
      </View>

      {/* Career Profile */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CAREER PROFILE</Text>
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.profileHint, { color: colors.mutedForeground }]}>
          Describe your career goals. This helps Novara suggest the right follow-up cadence for each contact.
        </Text>

        <TextInput
          value={statement}
          onChangeText={setStatement}
          placeholder="e.g. Breaking into early-stage VC, interested in AI/ML startups. Exploring roles in product at Series A–B companies."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          style={[
            styles.statementInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />

        <Pressable
          onPress={handleSaveStatement}
          style={({ pressed }) => [
            styles.saveStatementBtn,
            { backgroundColor: saved ? colors.warm : colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons
            name={saved ? "checkmark" : "save-outline"}
            size={16}
            color={colors.primaryForeground}
          />
          <Text style={[styles.saveStatementText, { color: colors.primaryForeground }]}>
            {saved ? "Saved" : "Save"}
          </Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Text style={[styles.goalTagsLabel, { color: colors.foreground }]}>Goal Tags</Text>
        <Text style={[styles.goalTagsHint, { color: colors.mutedForeground }]}>
          Tag contacts with these to boost their follow-up priority.
        </Text>

        <View style={styles.tagsWrap}>
          {profile.goalTags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
            >
              <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
              <Pressable onPress={() => handleRemoveTag(tag)} hitSlop={8}>
                <Ionicons name="close" size={13} color={colors.primary} />
              </Pressable>
            </View>
          ))}

          {showTagInput ? (
            <View style={[styles.tagInput, { borderColor: colors.primary, backgroundColor: colors.card }]}>
              <TextInput
                autoFocus
                value={newTag}
                onChangeText={setNewTag}
                onSubmitEditing={handleAddTag}
                placeholder="e.g. VC"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                style={[styles.tagInputText, { color: colors.foreground }]}
              />
              <Pressable onPress={handleAddTag} hitSlop={8}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => { setShowTagInput(false); setNewTag(""); }} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowTagInput(true)}
              style={[styles.addTagBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="add" size={14} color={colors.mutedForeground} />
              <Text style={[styles.addTagText, { color: colors.mutedForeground }]}>Add tag</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Coming soon */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>COMING SOON</Text>
      <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {COMING_SOON.map((item, index) => (
          <View key={item.label}>
            <View style={styles.listItem}>
              <View style={[styles.listIconBox, { backgroundColor: colors.muted }]}>
                <Ionicons name={item.icon} size={18} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.listLabel, { color: colors.foreground }]}>{item.label}</Text>
              <View style={[styles.soonPill, { backgroundColor: colors.muted }]}>
                <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Soon</Text>
              </View>
            </View>
            {index < COMING_SOON.length - 1 && (
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
          Project Novara helps you maintain the professional relationships that matter most. Track
          interactions, set follow-up reminders, and keep your network warm — all in one place.
        </Text>
      </View>
    </ScrollView>
  );
}

const COMING_SOON = [
  { icon: "logo-linkedin" as const, label: "LinkedIn share-to-app" },
  { icon: "calendar-outline" as const, label: "Calendar integration" },
  { icon: "mail-outline" as const, label: "Gmail integration" },
  { icon: "notifications-outline" as const, label: "Push notifications" },
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 12 },
  title: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  tagline: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  versionBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100, marginTop: 4 },
  versionText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 1.5,
    marginTop: 8,
  },
  profileCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  profileHint: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 19,
  },
  statementInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    minHeight: 100,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  saveStatementBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveStatementText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  divider: { height: 1 },
  goalTagsLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  goalTagsHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 17,
    marginTop: -4,
  },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  tagChipText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  tagInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  tagInputText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    minWidth: 60,
    maxWidth: 120,
  },
  addTagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addTagText: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium" },
  listCard: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  listItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  listIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  listLabel: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  soonPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  soonText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  aboutCard: { borderRadius: 20, borderWidth: 1, padding: 20 },
  aboutText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 22 },
});
