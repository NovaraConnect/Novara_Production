// ============================================================================
// How to delete a Novara account.
//
// PUBLIC AND UNAUTHENTICATED, like PrivacyPolicy and Support: Google Play asks
// for a web address where people can learn how to delete their account and
// data without reinstalling the app. Registered in App.tsx outside
// ProtectedRoute — do not wrap it.
//
// Everything described here is how Settings → Delete Account behaves today
// (api-server routes/account.ts). If that changes, this page changes with it.
// ============================================================================
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const CONTACT_EMAIL = "contact@novaraconnect.group";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function DeleteAccount() {
  return (
    <div className="mobile-container">
      <div className="px-5 pt-safe pb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Novara
        </Link>

        <h1 className="mt-6 font-serif text-3xl font-bold tracking-tight text-foreground">
          Delete your Novara account
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You can delete your Novara Connect account and everything stored in it at any time, from
          the app or from the website. You don't need to reinstall anything.
        </p>

        <Section title="How to delete it">
          <ol className="space-y-2 pl-5 list-decimal marker:text-primary/60">
            <li>
              Open the Novara app on your iPhone or Android phone, or sign in at{" "}
              <a href="/" className="text-primary font-medium hover:underline">
                app.novaraconnect.group
              </a>
              .
            </li>
            <li>Go to Settings.</li>
            <li>Choose Delete Account, then confirm.</li>
          </ol>
          <p>
            If you can no longer sign in, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary font-medium hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            from the address you signed up with and we will delete the account for you.
          </p>
        </Section>

        <Section title="What is deleted">
          <p>
            Everything Novara stores for you: your contacts and their photos, your notes, your career
            profile and goals, your notification settings and device push tokens, your subscription
            records, and any feedback you sent. Your sign-in account is deleted too.
          </p>
          <p>
            Deletion happens straight away and cannot be undone. There is no way to recover the data
            afterwards.
          </p>
          <p>
            Some of the services Novara uses may keep data for a limited time under their own
            retention rules, for example backups and email delivery logs. See the{" "}
            <Link href="/privacy" className="text-primary font-medium hover:underline">
              privacy policy
            </Link>{" "}
            for the full list.
          </p>
        </Section>

        <Section title="If you subscribe to Novara Pro">
          <p>
            Deleting your account does not cancel your subscription, because Apple or Google bills it.
            Cancel it first: on iPhone in Settings → your name → Subscriptions, and on Android in the
            Google Play app under Payments &amp; subscriptions → Subscriptions.
          </p>
        </Section>
      </div>
    </div>
  );
}
