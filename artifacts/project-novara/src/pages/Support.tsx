// ============================================================================
// Novara's support page.
//
// PUBLIC AND UNAUTHENTICATED, for the same reason as PrivacyPolicy: this is
// the URL given to Apple in App Store Connect's Support URL field, and Apple
// requires it to carry real support information reachable without an account.
// Registered in App.tsx outside ProtectedRoute — do not wrap it.
//
// Everything described here is behaviour that exists in the app today. If a
// feature named below is removed or moved, this page changes with it.
// ============================================================================
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const CONTACT_EMAIL = "hello@novaraconnect.group";

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-4">
      <p className="text-sm font-semibold text-foreground">{q}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export default function Support() {
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
          Support
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something not working, or not behaving the way you expected? Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary font-medium hover:underline"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          and we will get back to you. If you are signed in, Settings → Report a
          bug sends us the details automatically.
        </p>

        <h2 className="mt-10 font-serif text-xl font-bold text-foreground">
          Common questions
        </h2>

        <div className="mt-4 space-y-3">
          <QA q="How do I add someone?">
            <p>
              Open the Add tab. You can scan a business card with the camera,
              import someone from your iPhone contacts, or type the details in
              yourself.
            </p>
          </QA>

          <QA q="Does Novara read my address book?">
            <p>
              No. Importing a contact opens Apple's own contact picker, which
              runs outside the app. Novara receives only the one person you
              choose and never sees the rest of your address book.
            </p>
          </QA>

          <QA q="Where do card photos go?">
            <p>
              Nowhere. Text is recognised on your device and only that text is
              used. The photograph never leaves your phone.
            </p>
          </QA>

          <QA q="How does Novara decide when to remind me?">
            <p>
              Each contact has an importance level and a follow-up rhythm. Novara
              schedules the next follow-up from the last time you spoke, and
              moves people between Warm, Cooling, Cold and Dormant as time
              passes. You can override the cadence on any contact.
            </p>
          </QA>

          <QA q="I'm not getting reminders.">
            <p>
              Check Settings → Notification settings inside Novara, then check
              iOS Settings → Notifications → Novara to confirm they are allowed
              at the system level too.
            </p>
          </QA>

          <QA q="Can I use light mode?">
            <p>
              Yes. Settings → Appearance offers Light, Dark, or System, which
              follows your phone.
            </p>
          </QA>

          <QA q="How do I delete my account and data?">
            <p>
              Settings → Delete account. This permanently removes all of your
              contacts, settings and reminders, and then deletes your login. It
              is immediate and cannot be undone.
            </p>
          </QA>

          <QA q="What does Novara do with my data?">
            <p>
              The{" "}
              <Link
                href="/privacy"
                className="text-primary font-medium hover:underline"
              >
                privacy policy
              </Link>{" "}
              sets out exactly what is stored, which providers process it, and
              how to delete it.
            </p>
          </QA>
        </div>

        <p className="mt-10 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Still stuck? Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary font-medium hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
