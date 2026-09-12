import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { getSessionUser } from "../lib/session";

const MANAGEMENT_ROLES = ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"];

export default function TabsLayout() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSessionUser().then((user) => {
      setRole(user?.role ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const isManager = role !== null && MANAGEMENT_ROLES.includes(role);

  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="timer" options={{ title: "Timer" }} />
      <Tabs.Screen name="timesheet" options={{ title: "Timesheet" }} />
      {isManager && (
        <Tabs.Screen name="manage-tasks" options={{ title: "Tasks" }} />
      )}
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
      <Tabs.Screen name="leave" options={{ title: "Leave" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
