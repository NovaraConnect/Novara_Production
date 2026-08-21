import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useLocalImport } from "@/hooks/useLocalImport";

/**
 * One-time prompt to import on-device contacts into the signed-in account.
 * Non-destructive: local contacts are kept as a backup and never auto-deleted.
 */
export function LocalImportBanner({ onImported }: { onImported?: () => void }) {
  const colors = useColors();
  const { visible, pendingCount, importing, error, result, runImport, dismiss } =
    useLocalImport(onImported);

  if (result) {
    return (
      <View style={[styles.card, { backgroundColor: colors.warmBg, borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle" size={20} color={colors.warmText} />
        <Text style={[styles.text, { color: colors.warmText }]}>
          Imported {result.imported} contact{result.imported === 1 ? "" : "s"} to your account
          {result.skipped ? ` (${result.skipped} already there)` : ""}.
        </Text>
      </View>
    );
  }

  if (!visible) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Import your {pendingCount} on-device contact{pendingCount === 1 ? "" : "s"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          They&apos;ll be saved to your account. Your local copy is kept as a backup.
        </Text>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: importing ? 0.6 : 1 }]}
            onPress={runImport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Import</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={dismiss} disabled={importing}>
            <Text style={[styles.secondaryText, { color: colors.mutedForeground }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", marginBottom: 2 },
  subtitle: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 18 },
  text: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  error: { fontSize: 13, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: "center",
  },
  primaryText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  secondaryBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  secondaryText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
});
