import Link from 'next/link';

/**
 * Minimal, two-tile home with brand claim and chiaroscuro photos.
 * Place these files in /public/media/ with exact names:
 *  - /public/Tardelli.jpeg
 *  - /public/Moggi.jpg
 */
export default function HomeMinimalChiaroscuro() {
  return (
    <div className="page">
      {/* TOP */}
      <header className="top">
        <img src="/logo-talentlix.png" alt="TalentLix" className="logo" />
        <p className="claim">The place where talent gets discovered</p>
      </header>

      {/* TWO TILES */}
      <main className="tiles">
        {/* Athlete */}
        <section className="tile">
          <div className="imgBG athlete" role="img" aria-label="Athlete celebrating" />
          <h2 className="tileTitle">Athlete</h2>
          <div className="cta">
            <Link href="/login?role=athlete" className="btn outline" aria-label="Athlete login">Login</Link>
            <Link href="/register?role=athlete" className="btn fill" aria-label="Athlete register">Register</Link>
          </div>
        </section>

        {/* Clubs & Agents */}
        <section className="tile">
          <div className="imgBG operator" role="img" aria-label="Club executive" />
          <h2 className="tileTitle">Clubs & Agents</h2>
          <div className="cta">
            <Link href="/login?role=operator" className="btn outline" aria-label="Operator login">Login</Link>
            <Link href="/register?role=operator" className="btn fill" aria-label="Operator register">Register</Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="defs">
          <div>
            <strong>Definitions</strong>
            <p><b>Athlete</b>: an individual creating a professional sports profile, visible worldwide.</p>
            <p><b>Clubs & Agents</b>: verified operators (clubs, agencies, scouts) searching and contacting athletes.</p>
          </div>
        </div>
        <div className="legal">
          <Link href="/terms" className="foot">Terms</Link>
          <span>·</span>
          <Link href="/privacy" className="foot">Privacy</Link>
        </div>
      </footer>

      <style jsx>{`
        :global(html, body, #__next) { height: 100%; }
        .page { min-height: 100%; display: grid; grid-template-rows: auto 1fr auto; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0b0b0b; }
        .page::before { content: ""; position: fixed; inset:0; background: url('/BackG.png') center/cover no-repeat; z-index: -2; }
        .page::after { content: ""; position: fixed; inset:0; background: rgba(255,255,255,0.72); z-index: -1; }

        .top { text-align: center; padding: 28px 16px 12px; }
        .logo { width: 120px; height: auto; display: block; margin: 0 auto 8px; }
        .claim { font-size: clamp(16px, 2.2vw, 22px); font-weight: 800; color: #111; }

        .tiles { display: grid; gap: 16px; grid-template-columns: 1fr; max-width: 1100px; margin: 20px auto; padding: 0 16px; }
        @media (min-width: 860px) { .tiles { grid-template-columns: 1fr 1fr; } }
        .tile { background: rgba(248, 249, 250, 0.95); border: 1px solid #E0E0E0; border-radius: 18px; padding: 18px; box-shadow: 0 6px 20px rgba(0,0,0,0.06); display: grid; gap: 12px; }

        /* Chiaroscuro background blocks with brand-friendly overlays */
        .imgBG { position: relative; height: 320px; border-radius: 14px; overflow: hidden; }
        .imgBG::before, .imgBG::after { content: ""; position: absolute; inset: 0; }
        /* Athlete photo */
        .imgBG.athlete::before { background: center/cover no-repeat url('/Tardelli.jpeg'); filter: grayscale(1) contrast(1.25) brightness(0.55) saturate(0.8); transform: scale(1.04); }
        .imgBG.athlete::after { background: radial-gradient(60% 60% at 30% 25%, rgba(39,227,218,0.30) 0%, rgba(39,227,218,0.00) 70%), linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 100%); mix-blend-mode: multiply; }
        /* Operator photo with authoritative green tint */
        .imgBG.operator::before { background: center/cover no-repeat url('/Moggi.jpg'); filter: grayscale(0.15) contrast(1.1) brightness(0.85) saturate(1.05); transform: scale(1.02); }
        .imgBG.operator::after { background: linear-gradient(180deg, rgba(16,90,54,0.45) 0%, rgba(0,0,0,0.25) 100%); }

        .tileTitle { margin: 0; font-size: 22px; font-weight: 900; text-align: center; }
        .cta { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .btn { text-decoration: none; border-radius: 12px; padding: 10px 16px; font-weight: 900; }
        .btn.fill { background: linear-gradient(90deg,#27E3DA,#F7B84E); color: #fff; }
        .btn.outline { border: 2px solid #27E3DA; color: #27E3DA; }

        .footer { border-top: 1px solid #eee; background: rgba(255,255,255,0.85); padding: 18px 16px; }
        .defs { max-width: 1100px; margin: 0 auto 8px; color: #333; }
        .legal { display: flex; gap: 8px; justify-content: center; color: #555; }
        .foot { color: #111; text-decoration: none; }
      `}</style>
    </div>
  );
}
