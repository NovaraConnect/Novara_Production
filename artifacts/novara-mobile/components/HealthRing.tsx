import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useColors } from "@/hooks/useColors";

interface HealthRingProps {
  score: number;
}

function getScoreColor(score: number, colors: ReturnType<typeof useColors>) {
  if (score >= 75) return colors.warm;
  if (score >= 45) return colors.cooling;
  return colors.cold;
}

export function HealthRing({ score }: HealthRingProps) {
  const colors = useColors();
  const ringColor = getScoreColor(score, colors);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: score,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const barWidth = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      <View style={[styles.ring, { borderColor: ringColor + "33" }]}>
        <View style={[styles.innerRing, { borderColor: ringColor }]}>
          <Text style={[styles.score, { color: colors.foreground }]}>{score}</Text>
          <Text style={[styles.outOf, { color: colors.mutedForeground }]}>/100</Text>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
        <Animated.View style={[styles.barFill, { backgroundColor: ringColor, width: barWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 16,
  },
  ring: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  score: {
    fontSize: 38,
    fontFamily: "PlusJakartaSans_700Bold",
    lineHeight: 42,
  },
  outOf: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  barTrack: {
    width: 160,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
});
