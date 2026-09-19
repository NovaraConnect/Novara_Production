// ============================================================================
// Novara's privacy policy.
//
// PUBLIC AND UNAUTHENTICATED on purpose: it is the URL given to Apple in App
// Store Connect's Privacy Policy field, and a reviewer (or anyone) has to be
// able to read it without an account. It is registered in App.tsx OUTSIDE the
// ProtectedRoute wrapper — if that ever changes, App Review will fail on it.
//
// EVERY CLAIM HERE WAS READ OUT OF THE IMPLEMENTATION, not assumed:
//   • tables and columns        api-server/tests/schema.sql
//   • account deletion          api-server/src/routes/account.ts
//   • AI providers and payload  api-server/src/lib/{enrich,cardAiParse,linkedinAiParse}.ts
//   • news lookups             api-server/src/routes/news.ts
//   • feedback email            api-server/src/lib/email.ts
//   • analytics                 index.html + App.tsx (PostHogIdentifier)
//   • contacts picker           ios/App/App/Native/NovaraContactImport.swift
//   • card scanning             ios/App/App/Native/NovaraCardScanner.swift
//
// If any of those change, this page changes with them.
// ============================================================================
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

/** The date the text below was last materially changed. */
const LAST_UPDATED = "19 September 2026";

/** Where privacy questions go. Also Novara's VAPID subject address. */
const CONTACT_EMAIL = "hello@novaraconnect.group";

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

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc marker:text-primary/60">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Last updated {LAST_UPDATED}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Novara is a personal CRM for your professional network. It stores the
          people you choose to add and reminds you when it is time to get back
          in touch. This page explains exactly what that involves — what is
          stored, where it goes, and how to delete it.
        </p>

        <Section title="Who we are">
          <p>
            Novara Connect ("Novara", "we") provides the Novara application and
            website. For questions about this policy or about your data, contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary font-medium hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="Information you give us">
          <p>
            <strong className="text-foreground">Your account.</strong>{" "}
            Authentication is handled by Clerk, which stores your name, email
            address and sign-in credentials. Novara's own database stores only
            the account identifier Clerk issues — we never receive or store your
            password.
          </p>
          <p>
            <strong className="text-foreground">
              The contacts you add.
            </strong>{" "}
            For each person you save, Novara stores what you enter: first and
            last name, company, job title, email address, phone number, LinkedIn
            URL, where you met, your private notes, interests, and the
            scheduling fields Novara uses to time reminders (importance,
            priority, follow-up cadence, and the dates of first contact, last
            interaction and next follow-up).
          </p>
          <p>
            <strong className="text-foreground">Your settings.</strong> Your
            career statement, career goals and goal tags, plus your notification
            preferences and preferred reminder time.
          </p>
          <p>
            <strong className="text-foreground">Feedback.</strong> If you send
            feedback from inside the app we store the subject, your message, and
            — if you provide it — an email address to reply to, along with the
            page you sent it from, your browser or app user agent, and the app
            version.
          </p>
        </Section>

        <Section title="Device permissions">
          <p>
            Novara asks for three iOS permissions. All three are optional, and
            the app works without them.
          </p>
          <Bullets
            items={[
              <>
                <strong className="text-foreground">Contacts.</strong> When you
                import someone from your address book, Novara opens Apple's
                system contact picker. That picker runs outside the app: Novara
                cannot see your address book, and receives only the single
                person you choose. Nothing else is read, and nothing is uploaded
                except the fields that person's card contains, which then become
                an ordinary Novara contact.
              </>,
              <>
                <strong className="text-foreground">Camera.</strong> Used to
                scan a business card. The photograph is never uploaded. Text
                recognition happens on your device — using Apple's Vision
                framework in the app, or in your browser on the web — and only
                the recognised text leaves the device.
              </>,
              <>
                <strong className="text-foreground">Photos.</strong> Used only
                when you pick an existing image to scan instead of taking a new
                one. The image is processed on your device in the same way and
                is not uploaded.
              </>,
            ]}
          />
        </Section>

        <Section title="Notifications">
          <p>
            If you turn on reminders, Novara stores a push token for your device
            so Apple can deliver them. Notifications contain the reminder itself
            — for example which contact is due — and are sent through Apple's
            Push Notification service. You can turn them off at any time in
            Settings, which stops the reminders.
          </p>
        </Section>

        <Section title="Artificial intelligence">
          <p>
            Some Novara features use an AI provider — Google (Gemini) or
            Anthropic (Claude) — to turn unstructured text into structured
            fields. <strong className="text-foreground">Text only is ever sent. Images never are.</strong>
          </p>
          <Bullets
            items={[
              <>
                <strong className="text-foreground">Business cards.</strong> The
                text recognised on your device is sent to be split into name,
                company, role, email and phone.
              </>,
              <>
                <strong className="text-foreground">LinkedIn imports.</strong>{" "}
                The profile text you provide is sent to be split into the same
                fields.
              </>,
              <>
                <strong className="text-foreground">
                  Prioritising a contact.
                </strong>{" "}
                A contact's company, role and your notes about them are sent,
                together with your career statement and goals, so the provider
                can suggest a priority level and infer the contact's industry.
                This means your notes about a person may be processed by that
                provider.
              </>,
            ]}
          />
          <p>
            These providers process the text on our behalf under their own terms
            and privacy policies. Novara does not use your data to train AI
            models, and does not permit it to be used for that purpose.
          </p>
        </Section>

        <Section title="Company news">
          <p>
            Novara shows recent headlines about the companies your contacts work
            at, to give you something to reconnect about. To do this it sends{" "}
            <strong className="text-foreground">
              only the company name
            </strong>{" "}
            to GNews. Your identity and your contact's details are never sent.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            Novara uses PostHog to understand how the app is used so it can be
            improved. When you are signed in, PostHog receives your account
            identifier, email address and name, along with product usage events.
            It does not receive your contacts, your notes, or anything you store
            about the people in your network.
          </p>
        </Section>

        <Section title="Who processes your data">
          <p>
            Novara does not sell your data and does not share it for
            advertising. The following providers process data strictly to
            operate the service:
          </p>
          <Bullets
            items={[
              <>
                <strong className="text-foreground">Clerk</strong> —
                authentication and account management
              </>,
              <>
                <strong className="text-foreground">Neon</strong> — the Postgres
                database your contacts are stored in
              </>,
              <>
                <strong className="text-foreground">Render</strong> —
                application and website hosting
              </>,
              <>
                <strong className="text-foreground">
                  Google and/or Anthropic
                </strong>{" "}
                — the AI text processing described above
              </>,
              <>
                <strong className="text-foreground">GNews</strong> — company
                headlines, company name only
              </>,
              <>
                <strong className="text-foreground">Apple</strong> — push
                notification delivery
              </>,
              <>
                <strong className="text-foreground">Resend</strong> — delivering
                feedback you send us by email
              </>,
              <>
                <strong className="text-foreground">PostHog</strong> — product
                analytics
              </>,
            ]}
          />
        </Section>

        <Section title="What we do not do">
          <Bullets
            items={[
              "We do not sell your personal data.",
              "We do not show advertising in Novara.",
              "We do not track you across other companies' apps or websites.",
              "We do not read your address book. Contact import goes through Apple's own picker, one person at a time.",
              "We do not upload photographs taken or chosen for card scanning.",
            ]}
          />
        </Section>

        <Section title="Keeping and deleting your data">
          <p>
            Your data is kept for as long as your account exists. You can edit or
            delete any individual contact at any time.
          </p>
          <p>
            <strong className="text-foreground">
              To delete everything, go to Settings and choose Delete account.
            </strong>{" "}
            This removes all of your application data — contacts, settings, push
            tokens and feedback — and then deletes your authentication account.
            The application data is removed in a single transaction, so it goes
            together or not at all. Deletion is immediate and cannot be undone.
          </p>
          <p>
            Providers listed above may retain data for a limited period under
            their own retention schedules and legal obligations, for example
            backups and transactional email logs.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you live, you may have the right to access,
            correct, export or erase your personal data, and to object to or
            restrict certain processing. Much of this is available directly in
            the app: your contacts are editable and deletable, and Delete
            account erases everything. For anything else, write to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary font-medium hover:underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we will respond within the period the applicable law requires.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Novara is a professional networking tool intended for adults. It is
            not directed at children, and we do not knowingly collect personal
            data from anyone under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes materially we will update the date at the top
            of this page and, where the change is significant, tell you in the
            app.
          </p>
        </Section>

        <p className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Questions about this policy? Email{" "}
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
