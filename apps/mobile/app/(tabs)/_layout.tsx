import { Tabs } from "expo-router";

// Phase 1: single placeholder tab. Phase 12 adds Home, Today's Tasks,
// Timer, Timesheet, Notifications, Profile, Leave, Calendar per Section 21.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
    </Tabs>
  );
}
