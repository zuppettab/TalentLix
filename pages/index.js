import Link from 'next/link';

/**
 * Minimal, two-tile home with HEAVY chiaroscuro photos + bold footer.
 * Place these files in /public/media/ with exact names:
 *  - /public/media/Tardelli.jpeg  (athlete celebrating)
 *  - /public/media/Moggi.jpg      (executive portrait)
 */
export default function HomeMinimalChiaroscuro() {
  return (
    <div className="page">
      {/* TOP */}
      <header className="top">
        <img src="/logo-talentlix.png" alt="TalentLix" className="logo" />
        <p className="claim">The place where talent gets discovered</p>
      </header>

      {/* TWO MASSIVE TILES (with overlayed text) */}
      <main className="tiles">
        {/* Athlete */}
        <section className="tile">
          <div className="imgBG athlete" role="img" aria-label="Athlete celebrating" />
          <div className="tileInner">
            <h2 className="tileTitle">Athlete</h2>
            <div className="cta">
              <Link href="/login?role=athlete" className="btn ghost" aria-label="Athlete login">Login</Link>
              <Link href="/register?role=athlete" className="btn fill" aria-label="Athlete register">Register</Link>
            </div>
          </div>
        </section>

        {/* Clubs & Agents */}
        <section className="tile">
          <div className="imgBG operator" role="img" aria-label="Club executive" />
          <div className="tileInner">
            <h2 className="tileTitle">Clubs & Agents</h2>
            <div className="cta">
              <Link href="/login?role=operator" className="btn ghost" aria-label="Operator login">Login</Link>
              <Link href="/register?role=operator" className="btn fill" aria-label="Operator register">Register</Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER — typographic, not linky */}
      <footer className="footer">
        <div className="footGrid">
          <div className="footBlock big">
            <div className="stack">
              <span className="word">TALENT</span>
              <span className="dot">·</span>
              <span className="word">VISIBILITY</span>
              <span className="dot">·</span>
              <span className="word">OPPORTUNITY</span>
            </div>
            <div className="subtitle">Bauhaus‑inspired type · clean geometry · global reach</div>
          </div>
          <div className="footBlock mini">
            <div className="micro">© {new Date().getFullYear()} TalentLix</div>
            <div className="micro muted">Made for athletes, clubs and agents worldwide</div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        :global(html, body, #__next) { height: 100%; }
        .page { min-height: 100%; display: grid; grid-template-rows: auto 1fr auto; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0b0b0b; }
        .page::before { content: ""; position: fixed; inset:0; background: url('/BackG.png') center/cover no-repeat; z-index: -2; }
        .page::after { content: ""; position: fixed; inset:0; background: rgba(255,255,255,0.70); z-index: -1; }

        .top { text-align: center; padding: 28px 16px 10px; }
        .logo { width: 120px; height: auto; display: block; margin: 0 auto 8px; }
        .claim { font-size: clamp(16px, 2.2vw, 22px); font-weight: 800; color: #111; letter-spacing: 0.2px; }

        /* TILES */
        .tiles { display: grid; gap: 18px; grid-template-columns: 1fr; max-width: 1280px; margin: 18px auto 26px; padding: 0 16px; }
        @media (min-width: 980px) { .tiles { grid-template-columns: 1fr 1fr; gap: 22px; } }

        .tile { position: relative; border-radius: 20px; overflow: hidden; background: #111; min-height: clamp(360px, 65vh, 560px); box-shadow: 0 14px 34px rgba(0,0,0,0.18); }
        .imgBG { position: absolute; inset: 0; }
        .imgBG::before, .imgBG::after { content: ""; position: absolute; inset: 0; }

        /* ATHLETE: ultra-chiaroscuro so text can sit on top */
        .imgBG.athlete::before { background: center/cover no-repeat url('/media/Tardelli.jpeg'); filter: grayscale(1) contrast(1.45) brightness(0.26) saturate(0.6) blur(0.5px); transform: scale(1.06); }
        .imgBG.athlete::after { background: radial-gradient(55% 60% at 30% 30%, rgba(39,227,218,0.32) 0%, rgba(39,227,218,0.00) 65%), linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.30) 35%, rgba(0,0,0,0.75) 100%); mix-blend-mode: multiply; }

        /* OPERATOR: deep green authority + heavy darkening */
        .imgBG.operator::before { background: center/cover no-repeat url('/media/Moggi.jpg'); filter: grayscale(0.2) contrast(1.25) brightness(0.55) saturate(1) blur(0.4px); transform: scale(1.04); }
        .imgBG.operator::after { background: linear-gradient(180deg, rgba(16,90,54,0.65) 0%, rgba(0,0,0,0.65) 100%), radial-gradient(60% 60% at 70% 20%, rgba(84,242,155,0.22) 0%, rgba(84,242,155,0.00) 70%); mix-blend-mode: multiply; }

        /* Overlay content */
        .tileInner { position: relative; z-index: 2; height: 100%; display: grid; align-content: end; gap: 12px; padding: clamp(16px, 4vw, 28px); }
        .tileTitle { margin: 0; color: #fff; font-size: clamp(22px, 3.4vw, 36px); font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
        .cta { display: flex; gap: 12px; flex-wrap: wrap; }
        .btn { text-decoration: none; border-radius: 12px; padding: 12px 18px; font-weight: 900; letter-spacing: 0.3px; }
        .btn.fill { background: linear-gradient(90deg,#27E3DA,#F7B84E); color: #111; }
        .btn.ghost { background: rgba(255,255,255,0.12); color: #fff; border: 2px solid rgba(255,255,255,0.28); }

        /* FOOTER */
        .footer { position: relative; padding: clamp(20px, 5vw, 48px) 16px; background: #0d0e0e; color: #e9ecef; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg,#27E3DA,#F7B84E); }
        .footGrid { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; grid-template-columns: 1fr; align-items: center; }
        @media (min-width: 900px) { .footGrid { grid-template-columns: 2fr 1fr; } }
        .stack { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
        .word { font-weight: 1000; font-size: clamp(22px, 3.2vw, 40px); letter-spacing: 0.06em; }
        .dot { opacity: 0.5; font-size: clamp(20px, 3vw, 36px); transform: translateY(-2px); }
        .subtitle { margin-top: 6px; color: #cfd4da; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; }
        .micro { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .muted { opacity: 0.65; }
      `}</style>
    </div>
  );
}
