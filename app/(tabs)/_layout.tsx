import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="jobs" />
      <Stack.Screen name="jobs/[jobId]" />
      <Stack.Screen name="start-work" />
      <Stack.Screen name="hours/new" />
    </Stack>
  );
}
