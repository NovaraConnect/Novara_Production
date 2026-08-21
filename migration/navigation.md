# Novara — React Navigation Structure

Maps the web app's wouter routes to a React Navigation stack + tab setup.

## Dependencies

```
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
```

---

## Structure

```
<NavigationContainer>
  <RootStack>                          ← NativeStackNavigator, no header
    │
    ├── "Auth" group (unauthenticated)
    │     ├── Home          (/)        ← splash/landing, shown when signed out
    │     ├── SignIn        (/sign-in) ← @clerk/clerk-expo <SignIn />
    │     └── SignUp        (/sign-up) ← @clerk/clerk-expo <SignUp />
    │
    └── "App" group (authenticated, guarded by AuthGuard)
          │
          ├── MainTabs  ← BottomTabNavigator
          │     ├── Dashboard    tab  (icon: LayoutDashboard / home)
          │     ├── Contacts     tab  (icon: Users)
          │     ├── AddContact   tab  (icon: Plus, center FAB style)
          │     ├── Settings     tab  (icon: Settings / sliders)
          │     └── Notifications tab (icon: Bell)
          │
          ├── ContactDetail   (modal or push, params: { id: string })
          ├── EditContact     (push, params: { id: string })
          └── Demo            (modal, no auth required — optional)
```

---

## Navigation types (TypeScript)

```typescript
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

export type RootStackParamList = {
  Home: undefined;
  SignIn: undefined;
  SignUp: undefined;
  MainTabs: undefined;
  ContactDetail: { id: string };
  EditContact: { id: string };
  Demo: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Contacts: undefined;
  AddContact: undefined;
  Settings: undefined;
  Notifications: undefined;
};

export type RootStackProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;
```

---

## Root navigator (App.tsx)

```tsx
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProviderWrapper, AuthGuard } from "./migration/auth";
import { queryClient } from "./migration/queryClient";
import { useAuth } from "@clerk/clerk-expo";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return <LoadingScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isSignedIn ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
          <Stack.Screen name="EditContact" component={EditContactScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ClerkProviderWrapper>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </ClerkProviderWrapper>
  );
}
```

---

## Bottom tab navigator

```tsx
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2941a3",
        tabBarInactiveTintColor: "#6b7280",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#d9dce6",
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="AddContact" component={AddContactScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
    </Tab.Navigator>
  );
}
```

---

## Navigation patterns

| Web (wouter)                   | React Native                                      |
|-------------------------------|---------------------------------------------------|
| `useLocation()[1]("/contacts")` | `navigation.navigate("Contacts")`                |
| `useRoute("/contacts/:id")`    | `useRoute()` or `route.params.id`                |
| `useLocation()[1](-1)` (back)  | `navigation.goBack()`                            |
| `<Redirect to="/dashboard" />` | `navigation.replace("MainTabs")`                 |
| `<Link href="/add">`           | `navigation.navigate("AddContact")`              |
