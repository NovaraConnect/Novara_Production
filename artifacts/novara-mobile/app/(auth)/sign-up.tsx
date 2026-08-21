import { useSignUp } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function clerkErrorMessage(err: unknown): string {
  const e = err as { errors?: { message?: string; longMessage?: string }[] };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    "Something went wrong. Please try again."
  );
}

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp, setActive, isLoaded } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignUp = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // Root layout redirects signed-in users out of (auth).
      } else {
        setError("That code didn't complete verification. Please try again.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 48 }]}>
        {!pendingVerification ? (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Start turning your network into your edge
            </Text>

            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Email"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
            />

            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={onSignUp}
              disabled={submitting}
            >
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                {submitting ? "Creating…" : "Create account"}
              </Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={{ color: colors.mutedForeground }}>Already have an account? </Text>
              <Link href="/(auth)/sign-in">
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text>
              </Link>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Verify your email</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Enter the code we sent to {email.trim()}
            </Text>

            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
            />

            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={onVerify}
              disabled={submitting}
            >
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                {submitting ? "Verifying…" : "Verify"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 15, marginBottom: 28 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  error: { fontSize: 14, marginBottom: 12 },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
});
