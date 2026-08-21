import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ImportanceBadgeProps {
  importance: "High" | "Medium" | "Low";
  size?: "sm" | "md";
}

export function ImportanceBadge({ importance, size = "md" }: ImportanceBadgeProps) {
  const colors = useColors();

  const config = {
    High: { bg: colors.highBg, text: colors.highText },
    Medium: { bg: colors.mediumBg, text: colors.mediumText },
    Low: { bg: colors.lowBg, text: colors.lowText },
  }[importance];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, size === "sm" && styles.sm]}>
      <Text style={[styles.text, { color: config.text }, size === "sm" && styles.smText]}>
        {importance} Priority
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    alignSelf: "flex-start",
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 0.2,
  },
  smText: {
    fontSize: 11,
  },
});
