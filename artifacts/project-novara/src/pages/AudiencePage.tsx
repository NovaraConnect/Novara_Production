// ============================================================================
// One public page for every audience, at /about, with a tab per audience.
//
// Each tab renders an existing page with `embedded`, which leaves out that
// page's own header and footer: the Investors tab is /investors, the Students
// tab is /start. Edit those pages to change what a tab says; this file only
// owns the shared header, the tabs and the footer. To add an audience, give
// its page the same `embedded` prop and add it to TABS.
//
// The open tab lives in the URL (?tab=students) so a tab can be linked to
// directly. A query parameter rather than a hash: the Investors content
// already uses #contact, #problem and so on for its own sections.
//
// PUBLIC AND UNAUTHENTICATED on purpose, like the pages it shows. Kept out of
// search results while the Investors tab carries placeholders, the same as
// /investors.
// ============================================================================
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { NovaraMark } from "@/components/NovaraMark";
import { APP_STORE_URL } from "@/lib/appStore";
import InvestorPage from "@/pages/InvestorPage";
import StartPage from "@/pages/StartPage";

const NAVY = "#08111F";
const SANS = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";

const TABS = [
  {
    id: "investors",
    label: "Investors",
    Content: InvestorPage,
    cta: { label: "Get in touch", href: "#contact" },
  },
  {
    id: "students",
    label: "Students",
    Content: StartPage,
    cta: { label: "Get the app", href: APP_STORE_URL },
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromUrl(): TabId {
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((t) => t.id === wanted)?.id ?? TABS[0].id;
}

export default function AudiencePage() {
  const [active, setActive] = useState<TabId>(tabFromUrl);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tab = TABS.find((t) => t.id === active)!;

  // Back and forward move between tabs the visitor opened.
  useEffect(() => {
    const onPop = () => setActive(tabFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Novara Connect";

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    if (description) {
      description.content =
        "Novara Connect is a personal relationship CRM for students and young professionals: it notices when an important relationship is going cold, and helps you reach out.";
    }

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);

    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
      robots.remove();
    };
  }, []);

  function open(id: TabId, focus = false) {
    if (id !== active) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      url.hash = "";
      window.history.pushState(null, "", url);
      setActive(id);
      window.scrollTo({ top: 0 });
    }
    if (focus) tabRefs.current[id]?.focus();
  }

  // Arrow keys, Home and End move between tabs, as a tablist should.
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    open(TABS[next].id, true);
  }

  return (
    <div className="min-h-[100dvh] overflow-x-clip antialiased" style={{ fontFamily: SANS, background: NAVY }}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#08111F]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <NovaraMark size={30} />
            <span className="hidden font-serif text-lg font-bold text-white sm:inline">Novara Connect</span>
          </div>

          <div role="tablist" aria-label="Who is this for" className="flex rounded-full bg-white/10 p-1">
            {TABS.map((t) => {
              const selected = t.id === active;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  id={`tab-${t.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => open(t.id)}
                  onKeyDown={onTabKey}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors sm:px-5 ${
                    selected ? "bg-white text-[#08111F]" : "text-[#AAB7CA] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <a
            href={tab.cta.href}
            className="hidden rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#08111F] transition-colors hover:bg-[#E3E8F7] sm:inline-block"
          >
            {tab.cta.label}
          </a>
        </div>
      </header>

      <div id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        <tab.Content key={tab.id} embedded />
      </div>

      <footer className="border-t border-white/10 py-8 text-sm text-[#7D8BA3]">
        {/* On phones the Students tab has a sticky download bar; keep it off the links. */}
        <div
          className={`mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 sm:pb-0 ${
            tab.id === "students" ? "pb-20" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <NovaraMark size={20} />
            <span>© {new Date().getFullYear()} Novara Connect</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
