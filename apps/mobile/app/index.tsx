import { Redirect } from "expo-router";

// Phase 1: always send to login. Phase 2 replaces this with a real
// auth-state check (redirect to (tabs)/home if a valid session exists).
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
