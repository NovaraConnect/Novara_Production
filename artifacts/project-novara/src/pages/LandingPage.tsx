import { Link } from "wouter";

const PRIMARY = "#2952cc";

const features = [
  {
    icon: "📊",
    title: "Network Health Score",
    desc: "A live score out of 100 that shows how well you're maintaining your network. Like a fitness tracker, but for your career.",
  },
  {
    icon: "⏰",
    title: "Smart Cadence Reminders",
    desc: "Novara automatically sets the right follow-up timing based on how important each contact is to your goals.",
  },
  {
    icon: "📰",
    title: "Company News Feed",
    desc: "Get the top 3 recent news headlines for each contact's company — so you always have something relevant to say.",
  },
  {
    icon: "📇",
    title: "Business Card Scanner",
    desc: "Scan any business card and watch Novara auto-fill the contact details instantly.",
  },
  {
    icon: "🌡️",
    title: "Warm / Cold Indicators",
    desc: "Every contact is tagged Warm, Cooling, or Cold so you always know where to focus.",
  },
  {
    icon: "🎯",
    title: "Goal-Based Priority Ranking",
    desc: "Tell Novara your career goals and it automatically ranks your contacts by relevance.",
  },
];

const painPoints = [
  {
    title: "Contacts go cold",
    desc: "You met them at the perfect moment. Then never followed up.",
  },
  {
    title: "No system",
    desc: "Your network lives across LinkedIn, your phone, and sticky notes.",
  },
  {
    title: "Missed opportunities",
    desc: "74% of professionals lose valuable connections from failed follow-ups.",
  },
];

const steps = [
  { n: "1", title: "Add a contact", desc: "Scan a business card or add manually in seconds." },
  { n: "2", title: "Set your goals", desc: "Tell Novara your career ambitions once." },
  { n: "3", title: "Get smart reminders", desc: "Novara tells you exactly when to reach out and why." },
  { n: "4", title: "Never miss a connection", desc: "Your network health score keeps you accountable." },
];

const audiences = [
  {
    title: "MBA Students",
    desc: "Build your network from day one. Never let a recruiting contact go cold.",
  },
  {
    title: "Rotation Program Professionals",
    desc: "Manage relationships across departments, companies, and cohorts.",
  },
  {
    title: "Ambitious Young Professionals",
    desc: "Turn your network into your biggest career asset.",
  },
];

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#f5f5f0", color: "#1a1a1a", overflowX: "hidden" }}>

      {/* Nav */}
      <nav style={{ background: "#f5f5f0", borderBottom: "1px solid #e8e8e0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: `${PRIMARY}18`, border: `1px solid ${PRIMARY}33`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: PRIMARY }}>N</span>
            </div>
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: "#1a1a1a" }}>Novara</span>
          </div>
          <Link href="/">
            <button style={{ background: PRIMARY, color: "#fff", border: "none", borderRadius: 10, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Try Novara
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #1e3fa8 100%)`, color: "#fff", padding: "100px 24px 96px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-block", background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "6px 18px", fontSize: 13, fontWeight: 600, marginBottom: 28, letterSpacing: "0.04em" }}>
            Relationship Intelligence for Professionals
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(36px, 6vw, 62px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 22, letterSpacing: "-0.02em" }}>
            Your network is your net worth.<br />Novara helps you keep it.
          </h1>
          <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", opacity: 0.85, marginBottom: 44, maxWidth: 540, margin: "0 auto 44px", lineHeight: 1.6 }}>
            The intelligent relationship manager for ambitious professionals.
          </p>
          <Link href="/">
            <button style={{ background: "#fff", color: PRIMARY, border: "none", borderRadius: 14, padding: "16px 40px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
              Try Novara →
            </button>
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
              You meet the right people.<br />Then life gets in the way.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {painPoints.map((p) => (
              <div key={p.title} style={{ background: "#fff", borderRadius: 20, padding: 36, border: "1px solid #e8e8e0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 44, height: 44, background: `${PRIMARY}12`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <span style={{ fontSize: 22 }}>⚡</span>
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>{p.title}</h3>
                <p style={{ fontSize: 15, color: "#555", lineHeight: 1.65 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: `${PRIMARY}08`, padding: "96px 24px", borderTop: "1px solid #e8e8e0", borderBottom: "1px solid #e8e8e0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Novara keeps your relationships warm — automatically.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 24 }}>
            {steps.map((s) => (
              <div key={s.n} style={{ background: "#fff", borderRadius: 20, padding: 32, border: "1px solid #e8e8e0", position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 40, height: 40, background: PRIMARY, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{s.n}</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Everything you need to build<br />relationships that last.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {features.map((f) => (
              <div key={f.title} style={{ background: "#fff", borderRadius: 20, padding: 32, border: "1px solid #e8e8e0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ background: `${PRIMARY}08`, padding: "96px 24px", borderTop: "1px solid #e8e8e0", borderBottom: "1px solid #e8e8e0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Built for people who take<br />their career seriously.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {audiences.map((a) => (
              <div key={a.title} style={{ background: "#fff", borderRadius: 20, padding: 36, border: "1px solid #e8e8e0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", textAlign: "center" }}>
                <div style={{ width: 52, height: 52, background: `${PRIMARY}12`, border: `1px solid ${PRIMARY}22`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <span style={{ fontSize: 24 }}>
                    {a.title.includes("MBA") ? "🎓" : a.title.includes("Rotation") ? "🔄" : "🚀"}
                  </span>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{a.title}</h3>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.7 }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #1e3fa8 100%)`, color: "#fff", padding: "100px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px, 5vw, 50px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 20, letterSpacing: "-0.02em" }}>
            Your network score is waiting.
          </h2>
          <p style={{ fontSize: 18, opacity: 0.85, marginBottom: 44, lineHeight: 1.6 }}>
            Join the professionals who never miss a follow-up.
          </p>
          <Link href="/">
            <button style={{ background: "#fff", color: PRIMARY, border: "none", borderRadius: 14, padding: "18px 48px", fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
              Get Started Free
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#1a1a1a", color: "#aaa", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 26, height: 26, background: `${PRIMARY}30`, border: `1px solid ${PRIMARY}40`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: "#8fa8e8" }}>N</span>
          </div>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, color: "#ddd" }}>Novara</span>
        </div>
        <p style={{ fontSize: 13, margin: 0 }}>© 2026 Novara. Built for ambitious professionals.</p>
      </footer>
    </div>
  );
}
