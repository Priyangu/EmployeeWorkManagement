import { Tabs } from "expo-router";

// Phase 8: Timer tab added. Phase 12 adds Today's Tasks, Timesheet,
// Notifications, Profile, Leave, Calendar per Section 21.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="timer" options={{ title: "Timer" }} />
    </Tabs>
  );
}
