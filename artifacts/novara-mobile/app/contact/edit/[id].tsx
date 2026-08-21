import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useContacts } from "@/hooks/useContacts";
import { useProfile } from "@/hooks/useProfile";
import { Contact } from "@/types/contact";
import { addDays, suggestInitialFollowUp, suggestFollowUpDays } from "@/lib/utils";

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

export default function EditContact() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts, update } = useContacts();
  const { profile } = useProfile();
  const topPaddingWeb = Platform.OS === "web" ? 67 : 0;

  const contact = contacts.find((c) => c.id === id);

  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedinUrl ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [metAt, setMetAt] = useState(contact?.metAt ?? "");
  const [importance, setImportance] = useState<Contact["importance"]>(contact?.importance ?? "Medium");
  const [selectedGoalTags, setSelectedGoalTags] = useState<string[]>(contact?.goalTags ?? []);
  const [connectionStatus, setConnectionStatus] = useState<Contact["connectionStatus"]>(contact?.connectionStatus ?? "connected");
  const [initialFollowUpDays, setInitialFollowUpDays] = useState<Contact["initialFollowUpDays"]>(contact?.initialFollowUpDays ?? 5);
  const [followUpCadenceDays, setFollowUpCadenceDays] = useState<Contact["followUpCadenceDays"]>(contact?.followUpCadenceDays ?? 30);
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialSuggestion = suggestInitialFollowUp(role, metAt, importance);
  const cadenceSuggestion = suggestFollowUpDays(importance);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Required";
    if (!lastName.trim()) e.lastName = "Required";
    if (!company.trim()) e.company = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!contact || !validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      const lastDate = new Date(contact.lastInteractionDate);
      await update(contact.id, {
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
        nextFollowUpDate: addDays(lastDate, followUpCadenceDays).toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!contact) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Contact not found</Text>
      </View>
    );
  }

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
            paddingTop: insets.top + topPaddingWeb + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable testID="button-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Contact</Text>
        <View style={{ width: 32 }} />
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

        <View style={styles.row}>
          <View style={styles.half}>
            <Field label="First Name" value={firstName} onChange={setFirstName} error={errors.firstName} testID="input-firstName" />
          </View>
          <View style={styles.half}>
            <Field label="Last Name" value={lastName} onChange={setLastName} error={errors.lastName} testID="input-lastName" />
          </View>
        </View>

        <Field label="Company" value={company} onChange={setCompany} error={errors.company} testID="input-company" />
        <Field label="Role" value={role} onChange={setRole} optional testID="input-role" />
        <Field label="Where We Met" value={metAt} onChange={setMetAt} optional placeholder="Conference, LinkedIn DM..." testID="input-metAt" />
        <Field label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} optional testID="input-linkedin" />
        <Field label="Email" value={email} onChange={setEmail} optional placeholder="jane@company.com" testID="input-email" />
        <Field label="Phone" value={phone} onChange={setPhone} optional placeholder="+1 555 000 0000" testID="input-phone" />

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>IMPORTANCE</Text>
        <View style={styles.optionRow}>
          {IMPORTANCE_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
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

        {/* Follow-up timing card */}
        <View style={[styles.timingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Initial follow-up */}
          <View style={styles.timingSection}>
            <View style={styles.timingSectionHeader}>
              <Ionicons name="timer-outline" size={14} color={colors.primary} />
              <Text style={[styles.timingSectionTitle, { color: colors.foreground }]}>First reach-out</Text>
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
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedGoalTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
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

        <Field label="Notes" value={notes} onChange={setNotes} optional multiline testID="input-notes" />

        <Pressable
          testID="button-save-changes"
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || saving ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
            {saving ? "Saving..." : "Save Changes"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold" },
  content: { padding: 20, gap: 4 },
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
  groupLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },
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
  timingCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 4,
  },
  timingSection: { padding: 14, gap: 8 },
  timingSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  timingSectionTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  timingSectionHint: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 17 },
  divider: { height: 1, marginHorizontal: 14 },
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
  saveBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
});
