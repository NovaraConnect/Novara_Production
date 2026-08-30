import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useContacts } from "@/hooks/useContacts";
import { useProfile } from "@/hooks/useProfile";
import { Contact } from "@/types/contact";
import { suggestInitialFollowUp, suggestFollowUpDays, suggestImportance } from "@/lib/utils";

const IMPORTANCE_OPTIONS: Contact["importance"][] = ["High", "Medium", "Low"];
const INITIAL_OPTIONS: Contact["initialFollowUpDays"][] = [1, 2, 3, 5, 7, 14];
const CADENCE_OPTIONS: Contact["followUpCadenceDays"][] = [14, 30, 60, 90];

function labelDays(days: number): string {
  if (days === 1) return "1d";
  if (days === 14) return "2wk";
  if (days === 30) return "1mo";
  if (days === 60) return "2mo";
  if (days === 90) return "3mo";
  return `${days}d`;
}

export default function AddContact() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { create } = useContacts();
  const { profile } = useProfile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [metAt, setMetAt] = useState("");
  const [importance, setImportance] = useState<Contact["importance"]>("Medium");
  const [selectedGoalTags, setSelectedGoalTags] = useState<string[]>([]);
  const [initialFollowUpDays, setInitialFollowUpDays] = useState<Contact["initialFollowUpDays"]>(5);
  const [followUpCadenceDays, setFollowUpCadenceDays] = useState<Contact["followUpCadenceDays"]>(60);
  const [connectionStatus, setConnectionStatus] = useState<Contact["connectionStatus"]>("connected");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;


  const [importanceSuggestion, setImportanceSuggestion] = useState<{ importance: "High" | "Medium" | "Low"; reason: string } | null>(null);
  const [importanceSuggestionDismissed, setImportanceSuggestionDismissed] = useState(false);

  const initialSuggestion = suggestInitialFollowUp(role, metAt, importance);
  const cadenceSuggestion = suggestFollowUpDays(importance);

  useEffect(() => {
    if (role || company) {
      const s = suggestImportance(role, company, profile.goalTags, profile.careerStatement);
      setImportanceSuggestion(s);
      setImportanceSuggestionDismissed(false);
    } else {
      setImportanceSuggestion(null);
    }
  }, [role, company, profile.goalTags, profile.careerStatement]);

  useEffect(() => {
    setInitialFollowUpDays(initialSuggestion.days);
  }, [role, metAt, importance]);

  useEffect(() => {
    setFollowUpCadenceDays(cadenceSuggestion);
  }, [importance]);

  const applyImportanceSuggestion = () => {
    if (!importanceSuggestion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setImportance(importanceSuggestion.importance);
    setImportanceSuggestionDismissed(true);
  };

  const toggleGoalTag = (tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGoalTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Required";
    if (!lastName.trim()) e.lastName = "Required";
    if (!company.trim()) e.company = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        linkedinUrl: linkedinUrl.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim(),
        role: role.trim(),
        metAt: metAt.trim(),
        importance,
        initialFollowUpDays,
        followUpCadenceDays,
        goalTags: selectedGoalTags,
        connectionStatus,
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/(tabs)/contacts");
    } catch {
      Alert.alert("Error", "Could not save contact. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({
    label, value, onChange, placeholder, optional, multiline, error, testID,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; optional?: boolean; multiline?: boolean; error?: string; testID?: string;
  }) => (
    <View style={styles.fieldGroup}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        {optional && <Text style={[styles.optional, { color: colors.mutedForeground }]}>Optional</Text>}
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.border,
            color: colors.foreground,
            fontFamily: "PlusJakartaSans_400Regular",
          },
          multiline && styles.multiline,
        ]}
      />
      {error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.title, { color: colors.foreground }]}>Add Contact</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONTACT TYPE</Text>
        <View style={[styles.typeRow, { backgroundColor: colors.muted, borderRadius: 14, padding: 3 }]}>
          {(["connected", "pipeline"] as const).map((opt) => {
            const active = connectionStatus === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setConnectionStatus(opt);
                }}
                style={[
                  styles.typeBtn,
                  active && { backgroundColor: colors.card, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
                ]}
              >
                <Ionicons
                  name={opt === "connected" ? "people" : "paper-plane-outline"}
                  size={15}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <View>
                  <Text style={[styles.typeBtnLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
                    {opt === "connected" ? "Connected" : "Pipeline"}
                  </Text>
                  <Text style={[styles.typeBtnSub, { color: colors.mutedForeground }]}>
                    {opt === "connected" ? "Already met / connected" : "Still reaching out"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>BASICS</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" error={errors.firstName} testID="input-firstName" />
          </View>
          <View style={styles.half}>
            <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" error={errors.lastName} testID="input-lastName" />
          </View>
        </View>

        <Field label="Company" value={company} onChange={setCompany} placeholder="Google" error={errors.company} testID="input-company" />
        <Field label="Role" value={role} onChange={setRole} placeholder="Product Manager" optional testID="input-role" />

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONNECTION</Text>
        <Field label="Where We Met" value={metAt} onChange={setMetAt} placeholder="Conference, LinkedIn DM, Referral..." optional testID="input-metAt" />
        <Field label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} placeholder="linkedin.com/in/..." optional testID="input-linkedin" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="jane@company.com" optional testID="input-email" />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 000 0000" optional testID="input-phone" />

        {/* Importance */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>IMPORTANCE</Text>
        {importanceSuggestion && !importanceSuggestionDismissed && (
          <View style={[styles.suggestionBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <Ionicons name="sparkles" size={14} color={colors.primary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.suggestionTitle, { color: colors.primary }]}>
                Suggested: {importanceSuggestion.importance} Priority
              </Text>
              <Text style={[styles.suggestionReason, { color: colors.mutedForeground }]}>
                {importanceSuggestion.reason}
              </Text>
            </View>
            <Pressable onPress={applyImportanceSuggestion} style={[styles.applyBtn, { borderColor: colors.primary + "50" }]}>
              <Text style={[styles.applyBtnText, { color: colors.primary }]}>Apply</Text>
            </Pressable>
            <Pressable onPress={() => setImportanceSuggestionDismissed(true)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        )}
        <View style={styles.optionRow}>
          {IMPORTANCE_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              testID={`option-importance-${opt}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setImportance(opt);
              }}
              style={[
                styles.optionBtn,
                {
                  backgroundColor: importance === opt ? colors.primary : colors.card,
                  borderColor: importance === opt ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.optionText, { color: importance === opt ? colors.primaryForeground : colors.mutedForeground }]}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Career relevance tags */}
        {profile.goalTags.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CAREER RELEVANCE</Text>
            <View style={[styles.relevanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.relevanceHint, { color: colors.mutedForeground }]}>
                Which of your goals is this contact relevant to?
              </Text>
              <View style={styles.tagsWrap}>
                {profile.goalTags.map((tag) => {
                  const active = selectedGoalTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleGoalTag(tag)}
                      style={[
                        styles.tagChip,
                        {
                          backgroundColor: active ? colors.primary + "18" : colors.background,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {active && <Ionicons name="checkmark" size={12} color={colors.primary} />}
                      <Text style={[styles.tagChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* Follow-up timing card */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>FOLLOW-UP TIMING</Text>
        <View style={[styles.timingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Initial follow-up */}
          <View style={styles.timingSection}>
            <View style={styles.timingSectionHeader}>
              <Ionicons name="timer-outline" size={14} color={colors.primary} />
              <Text style={[styles.timingSectionTitle, { color: colors.foreground }]}>First reach-out</Text>
              <View style={[styles.aiChip, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.aiChipText, { color: colors.primary }]}>✦ AI</Text>
              </View>
            </View>
            <Text style={[styles.timingSectionHint, { color: colors.mutedForeground }]}>
              {initialSuggestion.reason}
            </Text>
            <View style={styles.optionRow}>
              {INITIAL_OPTIONS.map((opt) => {
                const isSelected = initialFollowUpDays === opt;
                const isSuggested = initialSuggestion.days === opt;
                return (
                  <Pressable
                    key={opt}
                    testID={`option-initial-${opt}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setInitialFollowUpDays(opt);
                    }}
                    style={[
                      styles.optionBtnSm,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.background,
                        borderColor: isSelected ? colors.primary : isSuggested ? colors.primary + "60" : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.optionTextSm, { color: isSelected ? colors.primaryForeground : colors.mutedForeground }]}>
                      {labelDays(opt)}
                    </Text>
                    {isSuggested && !isSelected && (
                      <Text style={[styles.suggestDot, { color: colors.primary }]}>✦</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Cadence */}
          <View style={styles.timingSection}>
            <View style={styles.timingSectionHeader}>
              <Ionicons name="refresh-outline" size={14} color={colors.primary} />
              <Text style={[styles.timingSectionTitle, { color: colors.foreground }]}>Ongoing cadence</Text>
              <View style={[styles.aiChip, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.aiChipText, { color: colors.primary }]}>✦ AI</Text>
              </View>
            </View>
            <Text style={[styles.timingSectionHint, { color: colors.mutedForeground }]}>
              How often to reconnect once you're in touch.
            </Text>
            <View style={styles.optionRow}>
              {CADENCE_OPTIONS.map((opt) => {
                const isSelected = followUpCadenceDays === opt;
                const isSuggested = cadenceSuggestion === opt;
                return (
                  <Pressable
                    key={opt}
                    testID={`option-cadence-${opt}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFollowUpCadenceDays(opt);
                    }}
                    style={[
                      styles.optionBtnSm,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.background,
                        borderColor: isSelected ? colors.primary : isSuggested ? colors.primary + "60" : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.optionTextSm, { color: isSelected ? colors.primaryForeground : colors.mutedForeground }]}>
                      {labelDays(opt)}
                    </Text>
                    {isSuggested && !isSelected && (
                      <Text style={[styles.suggestDot, { color: colors.primary }]}>✦</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>NOTES</Text>
        <Field label="Notes" value={notes} onChange={setNotes} placeholder="How you can help them, topics to discuss..." optional multiline testID="input-notes" />

        <Pressable
          testID="button-save-contact"
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || saving ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
            {saving ? "Saving..." : "Save Contact"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, fontFamily: "PlusJakartaSans_700Bold", letterSpacing: -0.5 },
  content: { padding: 20, gap: 4 },
  groupLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  fieldGroup: { marginBottom: 12, gap: 6 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  optional: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multiline: { height: 96, textAlignVertical: "top", paddingTop: 12 },
  errorText: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  optionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  optionBtnSm: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  optionTextSm: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  suggestDot: { fontSize: 9 },
  typeRow: { flexDirection: "row", gap: 4, marginBottom: 4 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
  },
  typeBtnLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  typeBtnSub: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  linkedinBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  suggestionTitle: { fontSize: 12, fontFamily: "PlusJakartaSans_700Bold" },
  suggestionReason: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2, lineHeight: 15 },
  applyBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  applyBtnText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  relevanceCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginBottom: 4,
  },
  relevanceHint: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 17 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  tagChipText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  timingCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 4,
  },
  timingSection: { padding: 14, gap: 8 },
  timingSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  timingSectionTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  timingSectionHint: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 17 },
  aiChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  aiChipText: { fontSize: 10, fontFamily: "PlusJakartaSans_700Bold" },
  divider: { height: 1, marginHorizontal: 14 },
  saveBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
});
