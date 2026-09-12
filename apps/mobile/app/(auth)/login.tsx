import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { login } from "../../lib/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() { setBusy(true); setError(null); try { await login(email.trim(), password); router.replace("/(tabs)/home"); } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); } finally { setBusy(false); } }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Employee Work Management</Text>
      <Text style={styles.subtitle}>Your workday, in one place.</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={() => void submit()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Signing in..." : "Sign in"}</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  input: { width: "100%", borderWidth: 1, borderColor: "#d9e1df", borderRadius: 10, padding: 12, backgroundColor: "#fff" },
  button: { width: "100%", backgroundColor: "#17324d", padding: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  error: { color: "#c62828" },
});
