import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { getAccessToken } from "../lib/session";

// Phase 1: always send to login. Phase 2 replaces this with a real
// auth-state check (redirect to (tabs)/home if a valid session exists).
export default function Index() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { void getAccessToken().then((token) => { setSignedIn(Boolean(token)); setReady(true); }); }, []);
  if (!ready) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator /></View>;
  return <Redirect href={signedIn ? "/(tabs)/home" : "/(auth)/login"} />;
}
