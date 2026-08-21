import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RelationshipStatus } from "@/types/contact";
import { useColors } from "@/hooks/useColors";

interface StatusBadgeProps {
  status: RelationshipStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const colors = useColors();

  const config = {
    Warm: { bg: colors.warmBg, text: colors.warmText, label: "Warm" },
    Cooling: { bg: colors.coolingBg, text: colors.coolingText, label: "Cooling" },
    Cold: { bg: colors.coldBg, text: colors.coldText, label: "Cold" },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, size === "sm" && styles.sm]}>
      <Text style={[styles.text, { color: config.text }, size === "sm" && styles.smText]}>
        {config.label}
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
