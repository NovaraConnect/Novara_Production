import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Dashboard from "@/pages/Dashboard";
import Contacts from "@/pages/Contacts";
import AddContact from "@/pages/AddContact";
import ContactDetail from "@/pages/ContactDetail";
import EditContact from "@/pages/EditContact";
import Settings from "@/pages/Settings";
import InstallGuide from "@/pages/InstallGuide";
import InstallLanding from "@/pages/InstallLanding";
import Notifications from "@/pages/Notifications";
import Feedback from "@/pages/Feedback";
import DemoDashboard from "@/pages/DemoDashboard";
import DemoContactDetail from "@/pages/DemoContactDetail";
import LandingPage from "@/pages/LandingPage";
import PitchPage from "@/pages/PitchPage";
import NotFound from "@/pages/not-found";
import SignInPage from "@/pages/SignIn";
import SignUpPage from "@/pages/SignUp";
import InstallPrompt from "@/components/InstallPrompt";
import { hasSeenInstallPrompt, isStandaloneDisplayMode } from "@/lib/installPrompt";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#2952cc",
    colorForeground: "#161d2e",
    colorMutedForeground: "#6b7280",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#d9dce6",
    colorInputForeground: "#161d2e",
    colorNeutral: "#d9dce6",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-gray-100",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#161d2e] font-bold",
    headerSubtitle: "text-[#6b7280]",
    socialButtonsBlockButtonText: "text-[#161d2e] font-medium",
    formFieldLabel: "text-[#161d2e] font-medium",
    footerActionLink: "text-[#2952cc] font-semibold",
    footerActionText: "text-[#6b7280]",
    dividerText: "text-[#6b7280]",
    identityPreviewEditButton: "text-[#2952cc]",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-[#161d2e]",
    logoBox: "flex justify-center",
    logoImage: "h-12 w-12 rounded-2xl",
    socialButtonsBlockButton: "border border-[#d9dce6] hover:bg-gray-50",
    formButtonPrimary: "bg-[#2952cc] hover:bg-[#1e3fa3] font-semibold",
    formFieldInput: "border border-[#d9dce6] bg-white text-[#161d2e]",
    footerAction: "bg-transparent",
    dividerLine: "bg-[#d9dce6]",
    alert: "border border-red-100 bg-red-50",
    otpCodeFieldInput: "border border-[#d9dce6]",
    formFieldRow: "",
    main: "",
  },
};

const queryClient = new QueryClient();

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function PostHogIdentifier() {
  const { addListener } = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current === userId) return;
      prevUserIdRef.current = userId;
      const ph = (window as any).posthog;
      if (!ph) return;
      if (userId) {
        ph.identify(userId, {
          email: user?.primaryEmailAddress?.emailAddress,
          name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
        });
      } else {
        ph.reset();
      }
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-background">
      <div
        className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

// Routing priority for "/" (see App auth/PWA spec):
//   1. While Clerk is loading            -> loading screen (never redirect prematurely)
//   2. Standalone (installed PWA)         -> Dashboard if signed in, else Sign In
//   3. Browser + authenticated            -> Dashboard
//   4. Browser + install prompt seen      -> Sign In
//   5. Browser, true first-time visitor   -> Install landing page
function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (isStandaloneDisplayMode()) {
    return isSignedIn ? <Redirect to="/dashboard" /> : <Redirect to="/sign-in" />;
  }

  if (isSignedIn) {
    return <Redirect to="/dashboard" />;
  }

  if (hasSeenInstallPrompt()) {
    return <Redirect to="/sign-in" />;
  }

  return <InstallLanding />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/contacts" component={() => <ProtectedRoute component={Contacts} />} />
      <Route path="/add" component={() => <ProtectedRoute component={AddContact} />} />
      <Route path="/contacts/:id/edit" component={() => <ProtectedRoute component={EditContact} />} />
      <Route path="/contacts/:id" component={() => <ProtectedRoute component={ContactDetail} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/install" component={InstallGuide} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/feedback" component={() => <ProtectedRoute component={Feedback} />} />
      <Route path="/try/contacts/:id" component={DemoContactDetail} />
      <Route path="/try" component={DemoDashboard} />
      <Route path="/demo" component={LandingPage} />
      <Route path="/pitch" component={PitchPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: { title: "Welcome back", subtitle: "Sign in to Project Novara" },
        },
        signUp: {
          start: { title: "Create your account", subtitle: "Start managing your network" },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
      <PostHogIdentifier />
          <Router />
          <InstallPrompt />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
