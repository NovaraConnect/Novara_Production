import { useState } from "react";

function PhoneMockup({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="pitch-card" style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
      breakInside: "avoid",
    }}>
      {/* Device frame */}
      <div style={{
        width: 200,
        background: "#1a1a1a",
        borderRadius: 36,
        padding: "10px 8px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(255,255,255,0.08)",
        position: "relative",
        flexShrink: 0,
      }}>
        {/* Notch */}
        <div style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          width: 72,
          height: 20,
          background: "#1a1a1a",
          borderRadius: "0 0 14px 14px",
          zIndex: 2,
        }} />
        {/* Screen */}
        <div style={{
          borderRadius: 28,
          overflow: "hidden",
          background: "#f0f0f0",
          aspectRatio: "9/19.5",
          position: "relative",
        }}>
          {!failed ? (
            <img
              src={src}
              alt={caption}
              onError={() => setFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(145deg, #eef1fb 0%, #dde4f5 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 16,
              textAlign: "center",
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(41,82,204,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <span style={{ fontSize: 10, color: "#2952cc", fontWeight: 600, lineHeight: 1.4 }}>
                Screenshot<br />coming soon
              </span>
            </div>
          )}
        </div>
      </div>
      {/* Caption */}
      <p style={{
        fontSize: 13,
        color: "#555555",
        textAlign: "center",
        maxWidth: 180,
        lineHeight: 1.5,
        margin: 0,
        fontWeight: 500,
      }}>{caption}</p>
    </div>
  );
}

export default function PitchPage() {
  const s = {
    page: {
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      background: "#f7f6f2",
      color: "#1a1a1a",
      margin: 0,
      padding: 0,
    } as React.CSSProperties,

    // ─── HERO ───────────────────────────────────────────────────────
    hero: {
      background: "linear-gradient(135deg, #2952cc 0%, #1e3d99 100%)",
      color: "#fff",
      padding: "80px 40px 90px",
      display: "flex",
      justifyContent: "center",
    } as React.CSSProperties,
    heroInner: {
      maxWidth: 1100,
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 64,
      flexWrap: "wrap" as const,
    } as React.CSSProperties,
    heroLeft: { flex: "1 1 400px", minWidth: 280 } as React.CSSProperties,
    heroLabel: {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase" as const,
      color: "rgba(255,255,255,0.65)",
      marginBottom: 24,
      borderBottom: "1px solid rgba(255,255,255,0.25)",
      paddingBottom: 8,
    } as React.CSSProperties,
    heroH1: {
      fontFamily: "Georgia, 'DM Serif Display', 'Times New Roman', serif",
      fontSize: "clamp(36px, 5vw, 60px)",
      fontWeight: 700,
      lineHeight: 1.12,
      margin: "0 0 20px",
    } as React.CSSProperties,
    heroSub: {
      fontSize: 18,
      lineHeight: 1.6,
      color: "rgba(255,255,255,0.8)",
      maxWidth: 480,
      margin: "0 0 36px",
    } as React.CSSProperties,
    heroCta: {
      display: "inline-block",
      background: "#fff",
      color: "#2952cc",
      fontWeight: 700,
      fontSize: 15,
      padding: "14px 32px",
      borderRadius: 10,
      textDecoration: "none",
      letterSpacing: "0.01em",
    } as React.CSSProperties,
    heroRight: { flex: "0 1 300px", minWidth: 240 } as React.CSSProperties,
    healthCard: {
      background: "rgba(255,255,255,0.1)",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: 16,
      padding: 28,
      backdropFilter: "blur(8px)",
    } as React.CSSProperties,
    healthCardTitle: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.15em",
      textTransform: "uppercase" as const,
      color: "rgba(255,255,255,0.5)",
      marginBottom: 8,
    } as React.CSSProperties,
    healthScore: {
      fontFamily: "Georgia, serif",
      fontSize: 52,
      fontWeight: 700,
      lineHeight: 1,
      color: "#fff",
      marginBottom: 4,
    } as React.CSSProperties,
    healthMax: {
      fontSize: 18,
      color: "rgba(255,255,255,0.45)",
      fontWeight: 400,
    } as React.CSSProperties,
    healthBarTrack: {
      background: "rgba(255,255,255,0.15)",
      borderRadius: 99,
      height: 8,
      margin: "16px 0 20px",
      overflow: "hidden",
    } as React.CSSProperties,
    healthBarFill: {
      background: "linear-gradient(90deg, #52b788, #3a9d6e)",
      borderRadius: 99,
      height: "100%",
      width: "82%",
    } as React.CSSProperties,
    tagRow: { display: "flex", gap: 8, flexWrap: "wrap" as const } as React.CSSProperties,
    tagWarm: {
      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 99,
      background: "rgba(82,183,136,0.25)", color: "#7ee3ae", border: "1px solid rgba(82,183,136,0.3)",
    } as React.CSSProperties,
    tagCooling: {
      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 99,
      background: "rgba(251,191,36,0.2)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)",
    } as React.CSSProperties,
    tagCold: {
      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 99,
      background: "rgba(147,197,253,0.2)", color: "#93c5fd", border: "1px solid rgba(147,197,253,0.25)",
    } as React.CSSProperties,

    // ─── SECTION WRAPPERS ────────────────────────────────────────────
    sectionLight: {
      background: "#f7f6f2", padding: "80px 40px", display: "flex", justifyContent: "center",
    } as React.CSSProperties,
    sectionNavy: {
      background: "linear-gradient(135deg, #2952cc 0%, #1e3d99 100%)",
      color: "#fff", padding: "80px 40px", display: "flex", justifyContent: "center",
    } as React.CSSProperties,
    sectionTint: {
      background: "#eef1fb", padding: "80px 40px", display: "flex", justifyContent: "center",
    } as React.CSSProperties,
    sectionInner: { maxWidth: 1100, width: "100%" } as React.CSSProperties,

    // ─── SECTION LABELS + HEADINGS ───────────────────────────────────
    sectionLabelDark: {
      fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
      textTransform: "uppercase" as const, color: "#2952cc", marginBottom: 16, display: "block",
    } as React.CSSProperties,
    sectionLabelLight: {
      fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
      textTransform: "uppercase" as const, color: "rgba(255,255,255,0.55)", marginBottom: 16, display: "block",
    } as React.CSSProperties,
    h2Dark: {
      fontFamily: "Georgia, 'DM Serif Display', serif",
      fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, lineHeight: 1.2, color: "#1a1a1a", margin: "0 0 12px",
    } as React.CSSProperties,
    h2Light: {
      fontFamily: "Georgia, 'DM Serif Display', serif",
      fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, lineHeight: 1.2, color: "#fff", margin: "0 0 12px",
    } as React.CSSProperties,
    subDark: {
      fontSize: 17, color: "#555555", lineHeight: 1.6, margin: "0 0 52px", maxWidth: 560,
    } as React.CSSProperties,
    subLight: {
      fontSize: 17, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: "0 0 52px", maxWidth: 560,
    } as React.CSSProperties,

    // ─── CARDS ───────────────────────────────────────────────────────
    cardGrid3: {
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24,
    } as React.CSSProperties,
    cardGrid2x3: {
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24,
    } as React.CSSProperties,
    cardWhite: {
      background: "#fff", borderRadius: 14, padding: 32,
      boxShadow: "0 2px 20px rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.06)",
    } as React.CSSProperties,
    cardNavyGlass: {
      background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 14, padding: 32, backdropFilter: "blur(8px)",
    } as React.CSSProperties,
    cardTintBlue: {
      background: "#fff", borderRadius: 14, padding: 32,
      boxShadow: "0 2px 20px rgba(41,82,204,0.07)", border: "1px solid rgba(41,82,204,0.1)",
    } as React.CSSProperties,
    cardTitle: {
      fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px",
    } as React.CSSProperties,
    cardTitleLight: {
      fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 10px",
    } as React.CSSProperties,
    cardBody: { fontSize: 15, color: "#555555", lineHeight: 1.65, margin: 0 } as React.CSSProperties,
    cardBodyLight: { fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, margin: 0 } as React.CSSProperties,

    // ─── STEPS ───────────────────────────────────────────────────────
    stepsRow: {
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24,
    } as React.CSSProperties,
    stepNum: {
      fontFamily: "Georgia, serif", fontSize: 42, fontWeight: 700,
      color: "rgba(255,255,255,0.2)", lineHeight: 1, marginBottom: 16,
    } as React.CSSProperties,

    // ─── ICON BOX ────────────────────────────────────────────────────
    iconBox: {
      width: 48, height: 48, borderRadius: 12, background: "#eef1fb",
      display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, flexShrink: 0,
    } as React.CSSProperties,

    // ─── CTA ─────────────────────────────────────────────────────────
    ctaSection: {
      background: "linear-gradient(135deg, #1e3d99 0%, #2952cc 100%)",
      color: "#fff", padding: "100px 40px", textAlign: "center" as const, display: "flex", justifyContent: "center",
    } as React.CSSProperties,
    ctaH2: {
      fontFamily: "Georgia, 'DM Serif Display', serif",
      fontSize: "clamp(32px, 5vw, 54px)", fontWeight: 700, lineHeight: 1.15, color: "#fff", margin: "0 0 16px",
    } as React.CSSProperties,
    ctaSub: { fontSize: 18, color: "rgba(255,255,255,0.75)", margin: "0 0 40px", lineHeight: 1.6 } as React.CSSProperties,
    ctaBtn: {
      display: "inline-block", background: "#52b788", color: "#fff", fontWeight: 700, fontSize: 16,
      padding: "16px 40px", borderRadius: 12, textDecoration: "none", letterSpacing: "0.01em",
      boxShadow: "0 4px 20px rgba(82,183,136,0.4)",
    } as React.CSSProperties,
    footer: { marginTop: 48, fontSize: 13, color: "rgba(255,255,255,0.4)" } as React.CSSProperties,
  };

  // ─── SVG ICONS ─────────────────────────────────────────────────────
  const IconScore = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
    </svg>
  );
  const IconBell = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
  const IconNews = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
    </svg>
  );
  const IconScan = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  );
  const IconThermometer = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
    </svg>
  );
  const IconTarget = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  );

  const features = [
    { icon: <IconScore />, title: "Network Health Score", desc: "A live score out of 100 that shows how well you're maintaining your network. Like a fitness tracker, but for your career." },
    { icon: <IconBell />, title: "Smart Cadence Reminders", desc: "Novara automatically sets the right follow-up timing based on how important each contact is to your goals." },
    { icon: <IconNews />, title: "Company News Feed", desc: "Get the top 3 recent news headlines for each contact's company — so you always have something relevant to say." },
    { icon: <IconScan />, title: "Business Card Scanner", desc: "Scan any business card and watch Novara auto-fill the contact details instantly." },
    { icon: <IconThermometer />, title: "Warm / Cold Indicators", desc: "Every contact is tagged Warm, Cooling, or Cold so you always know where to focus." },
    { icon: <IconTarget />, title: "Goal-Based Priority Ranking", desc: "Tell Novara your career goals and it automatically ranks your contacts by relevance." },
  ];

  const screenshots = [
    { src: "/screenshots/dashboard.png", caption: "Your network health at a glance" },
    { src: "/screenshots/contact-detail.png", caption: "Smart conversation starters from real company news" },
    { src: "/screenshots/add-contact.png", caption: "Goal-based priority, suggested automatically" },
    { src: "/screenshots/scanner.png", caption: "Scan a business card, fields auto-fill" },
    { src: "/screenshots/notifications.png", caption: "Push notifications so you never miss a follow-up" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }

        .pdf-fab {
          position: fixed;
          bottom: 32px;
          right: 32px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1a1a1a;
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          padding: 14px 22px;
          border-radius: 99px;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(0,0,0,0.25);
          transition: transform 0.15s, box-shadow 0.15s;
          text-decoration: none;
        }
        .pdf-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }

        @media (max-width: 640px) {
          .hero-inner { flex-direction: column; gap: 40px !important; }
          .hero-right { width: 100% !important; max-width: 100% !important; }
          .screenshots-row { flex-direction: column !important; align-items: center !important; }
        }

        @media print {
          /* Force color rendering */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body { margin: 0; background: #f7f6f2 !important; }

          /* Page setup — generous margins for clean edges */
          @page { margin: 0.6in 0.5in; size: A4; }

          /* Each major section: start fresh, don't split internally */
          .pitch-section {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          /* Hero and navy sections: force their backgrounds */
          .hero-section {
            background: #2952cc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .navy-section {
            background: #1e3d99 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .tint-section {
            background: #eef1fb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Cards and phone frames must never be cut in half */
          .pitch-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Section that starts new logical page groups */
          .pitch-section-break {
            break-before: page;
            page-break-before: always;
          }

          /* Hide UI chrome that isn't pitch content */
          .no-print,
          .pdf-fab,
          [data-testid],
          button:not(.pitch-btn) { display: none !important; }

          /* Slightly reduce padding in print to fit more per page */
          .pitch-section > div { padding-top: 48px !important; padding-bottom: 48px !important; }

          /* Screenshots: smaller for print to fit on page */
          .screenshot-phone { width: 140px !important; }
        }
      `}</style>

      {/* Floating PDF download button — hidden when printing */}
      <button
        className="pdf-fab"
        onClick={() => window.print()}
        aria-label="Download as PDF"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PDF
      </button>

      <div style={s.page}>

        {/* ── 1. HERO ─────────────────────────────────────────────── */}
        <section className="pitch-section hero-section" style={s.hero}>
          <div className="hero-inner" style={s.heroInner}>
            <div style={s.heroLeft}>
              <span style={s.heroLabel}>Introducing Novara</span>
              <h1 style={s.heroH1}>Your network is your net worth. Novara helps you keep it.</h1>
              <p style={s.heroSub}>The intelligent relationship manager for ambitious professionals who know careers are built on connections.</p>
              <a href="/" style={s.heroCta}>Try Novara →</a>
            </div>
            <div className="hero-right" style={s.heroRight}>
              <div style={s.healthCard}>
                <div style={s.healthCardTitle}>Network Health</div>
                <div style={s.healthScore}>82<span style={s.healthMax}> / 100</span></div>
                <div style={s.healthBarTrack}><div style={s.healthBarFill} /></div>
                <div style={s.tagRow}>
                  <span style={s.tagWarm}>● Warm (12)</span>
                  <span style={s.tagCooling}>● Cooling (5)</span>
                  <span style={s.tagCold}>● Cold (3)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. PROBLEM ──────────────────────────────────────────── */}
        <section className="pitch-section" style={s.sectionLight}>
          <div style={s.sectionInner}>
            <span style={s.sectionLabelDark}>The Problem</span>
            <h2 style={s.h2Dark}>You meet the right people.<br />Then life gets in the way.</h2>
            <p style={s.subDark}>Most professionals are sitting on an underutilized goldmine — their own network.</p>
            <div style={s.cardGrid3}>
              {[
                { title: "Contacts go cold", body: "You met them at the perfect moment. Then you never followed up — and the window closed.", accent: "#2952cc" },
                { title: "No system", body: "Your network lives across LinkedIn, your phone, and sticky notes. There's no single source of truth.", accent: "#52b788" },
                { title: "Missed opportunities", body: "74% of professionals lose valuable connections from failed follow-ups.", accent: "#f59e0b" },
              ].map((c) => (
                <div key={c.title} className="pitch-card" style={s.cardWhite}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: c.accent, marginBottom: 20 }} />
                  <h3 style={s.cardTitle}>{c.title}</h3>
                  <p style={s.cardBody}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. HOW IT WORKS ─────────────────────────────────────── */}
        <section className="pitch-section navy-section" style={s.sectionNavy}>
          <div style={s.sectionInner}>
            <span style={s.sectionLabelLight}>How It Works</span>
            <h2 style={s.h2Light}>Novara keeps your relationships warm — automatically.</h2>
            <p style={s.subLight}>Four simple steps, one powerful habit.</p>
            <div style={s.stepsRow}>
              {[
                { n: "01", title: "Add a contact", body: "Scan a business card or add manually in seconds." },
                { n: "02", title: "Set your goals", body: "Tell Novara your career ambitions once." },
                { n: "03", title: "Get smart reminders", body: "Know exactly when to reach out and why." },
                { n: "04", title: "Never miss a connection", body: "Your network health score keeps you accountable." },
              ].map((step) => (
                <div key={step.n} className="pitch-card" style={s.cardNavyGlass}>
                  <div style={s.stepNum}>{step.n}</div>
                  <h3 style={s.cardTitleLight}>{step.title}</h3>
                  <p style={s.cardBodyLight}>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3b. PRODUCT SHOWCASE ────────────────────────────────── */}
        <section className="pitch-section tint-section pitch-section-break" style={s.sectionTint}>
          <div style={s.sectionInner}>
            <span style={s.sectionLabelDark}>See It In Action</span>
            <h2 style={s.h2Dark}>A product people actually want to open.</h2>
            <p style={{ ...s.subDark, marginBottom: 56 }}>Real screenshots from the Novara app.</p>
            <div
              className="screenshots-row"
              style={{
                display: "flex",
                gap: 32,
                justifyContent: "center",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              {screenshots.map((s) => (
                <PhoneMockup key={s.src} src={s.src} caption={s.caption} />
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. FEATURES ─────────────────────────────────────────── */}
        <section className="pitch-section pitch-section-break" style={s.sectionLight}>
          <div style={s.sectionInner}>
            <span style={s.sectionLabelDark}>Features</span>
            <h2 style={s.h2Dark}>Everything you need to build<br />relationships that last.</h2>
            <p style={s.subDark}>Purpose-built tools for relationship-driven professionals.</p>
            <div style={s.cardGrid2x3}>
              {features.map((f) => (
                <div key={f.title} className="pitch-card" style={s.cardWhite}>
                  <div style={s.iconBox}>{f.icon}</div>
                  <h3 style={s.cardTitle}>{f.title}</h3>
                  <p style={s.cardBody}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. WHO IT'S FOR ─────────────────────────────────────── */}
        <section className="pitch-section tint-section" style={s.sectionTint}>
          <div style={s.sectionInner}>
            <span style={s.sectionLabelDark}>Who It's For</span>
            <h2 style={s.h2Dark}>Built for people who take their career seriously.</h2>
            <p style={{ ...s.subDark, marginBottom: 48 }}>Novara is purpose-built for professionals at the moment their network matters most.</p>
            <div style={s.cardGrid3}>
              {[
                {
                  title: "MBA Students",
                  body: "Build your network from day one. Never let a recruiting contact go cold.",
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                    </svg>
                  ),
                },
                {
                  title: "Rotation Program Professionals",
                  body: "Manage relationships across departments, companies, and cohorts.",
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  ),
                },
                {
                  title: "Ambitious Young Professionals",
                  body: "Turn your network into your biggest career asset.",
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2952cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                    </svg>
                  ),
                },
              ].map((c) => (
                <div key={c.title} className="pitch-card" style={s.cardTintBlue}>
                  <div style={{ ...s.iconBox, background: "#dde4f5", marginBottom: 20 }}>{c.icon}</div>
                  <h3 style={s.cardTitle}>{c.title}</h3>
                  <p style={s.cardBody}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. CTA ──────────────────────────────────────────────── */}
        <section className="pitch-section navy-section" style={s.ctaSection}>
          <div style={{ maxWidth: 640, width: "100%", textAlign: "center" }}>
            <h2 style={s.ctaH2}>Your network score is waiting.</h2>
            <p style={s.ctaSub}>Join the professionals who never miss a follow-up.</p>
            <a href="/" style={s.ctaBtn} className="pitch-btn">Get Started Free</a>
            <p style={s.footer}>© 2026 Novara · Built for ambitious professionals</p>
          </div>
        </section>

      </div>
    </>
  );
}
