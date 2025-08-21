import Link from 'next/link';

/**
 * HOME — minimal, modern, brand‑coherent.
 * No photos. Abstract, CSS‑generated backgrounds in brand palette.
 * Link/CTA colors match the brand (as in login): #27E3DA + gradient to #F7B84E.
 */
export default function HomeAbstractMinimal() {
  return (
    <div className="page">
      {/* TOP (logo + claim) */}
      <header className="top">
        <img src="/logo-talentlix.png" alt="TalentLix" className="logo" />
        <p className="claim">The place where talent gets discovered</p>
      </header>

      {/* TWO BIG TILES */}
      <main className="tiles" aria-label="Choose your area">
        {/* ATHLETE */}
        <section className="tile" aria-labelledby="athlete-title">
          <div className="bg athlete" aria-hidden="true" />
          <div className="inner">
            <h2 id="athlete-title" className="title">Athlete</h2>
            <div className="cta">
              <Link href="/login?role=athlete" className="btn outline" aria-label="Athlete login">Login</Link>
              <Link href="/register?role=athlete" className="btn fill" aria-label="Athlete register">Register</Link>
            </div>
          </div>
        </section>

        {/* CLUBS & AGENTS */}
        <section className="tile" aria-labelledby="operator-title">
          <div className="bg operator" aria-hidden="true" />
          <div className="inner">
            <h2 id="operator-title" className="title">Clubs & Agents</h2>
            <div className="cta">
              <Link href="/login?role=operator" className="btn outline" aria-label="Operator login">Login</Link>
              <Link href="/register?role=operator" className="btn fill" aria-label="Operator register">Register</Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER — typographic */}
      <footer className="footer" role="contentinfo">
        <div className="fwrap">
          <div className="mantra" aria-label="Mantra">
            <span className="w">TALENT</span>
            <span className="dot">·</span>
            <span className="w">VISIBILITY</span>
            <span className="dot">·</span>
            <span className="w">OPPORTUNITY</span>
          </div>
          <div className="meta">© {new Date().getFullYear()} TalentLix — Made for athletes, clubs & agents worldwide</div>
        </div>
      </footer>

      <style jsx>{`
        /* BRAND TOKENS */
        :root { --brand-a:#27E3DA; --brand-b:#F7B84E; --text:#0b0b0b; --muted:#555; --card:#F8F9FA; --border:#E0E0E0; }
        :global(html, body, #__next){ height:100%; }
        .page{ min-height:100%; display:grid; grid-template-rows:auto 1fr auto; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--text); }
        .page::before{ content:""; position:fixed; inset:0; background:url('/BackG.png') center/cover no-repeat; z-index:-2; }
        .page::after{ content:""; position:fixed; inset:0; background:rgba(255,255,255,0.75); z-index:-1; }

        /* TOP */
        .top{ text-align:center; padding:28px 16px 10px; }
        .logo{ width:118px; height:auto; display:block; margin:0 auto 8px; }
        .claim{ font-size:clamp(16px,2.2vw,22px); font-weight:800; letter-spacing:.2px; }

        /* TILES LAYOUT */
        .tiles{ display:grid; gap:22px; max-width:1320px; margin:20px auto 30px; padding:0 16px; grid-template-columns:1fr; }
        @media (min-width: 980px){ .tiles{ grid-template-columns:1fr 1fr; } }
        .tile{ position:relative; border-radius:22px; overflow:hidden; min-height:clamp(50vh, 62vh, 680px); background:#111; box-shadow:0 18px 42px rgba(0,0,0,.18); }
        .inner{ position:relative; z-index:2; height:100%; display:grid; align-content:end; padding:clamp(18px,4vw,32px); gap:12px; }
        .title{ margin:0; color:#fff; font-weight:1000; letter-spacing:.5px; text-transform:uppercase; font-size:clamp(22px,3.4vw,36px); }
        .cta{ display:flex; gap:12px; flex-wrap:wrap; }

        /* BUTTONS (coherent with login) */
        .btn{ text-decoration:none; border-radius:14px; padding:12px 18px; font-weight:900; letter-spacing:.3px; }
        .btn.fill{ background:linear-gradient(90deg,var(--brand-a),var(--brand-b)); color:#111; }
        .btn.outline{ border:2px solid var(--brand-a); color:var(--brand-a); background:transparent; }
        .btn:focus-visible{ outline:3px solid var(--brand-a); outline-offset:2px; }

        /* LINKS GENERAL (match brand) */
        :global(a){ color: var(--brand-a); text-decoration:none; }
        :global(a:hover){ filter:brightness(0.9); }

        /* ABSTRACT BACKGROUNDS */
        .bg{ position:absolute; inset:0; }
        .bg::before, .bg::after{ content:""; position:absolute; inset:0; }

        /* Athlete: turquoise‑first, amber accents, subtle grain */
        .bg.athlete::before{
          background:
            radial-gradient(1200px 600px at 15% 15%, rgba(39,227,218,0.65), rgba(39,227,218,0.0) 60%),
            radial-gradient(900px 500px at 80% 30%, rgba(247,184,78,0.55), rgba(247,184,78,0.0) 65%),
            radial-gradient(1200px 1200px at 50% 95%, rgba(0,0,0,0.7), rgba(0,0,0,0.85));
          filter: saturate(1.05) contrast(1.15) brightness(0.85);
        }
        .bg.athlete::after{ background: conic-gradient(from 210deg at 60% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.08), rgba(255,255,255,0.04)); mix-blend-mode: overlay; opacity:.5; }

        /* Operator: inverse palette with deep authority green */
        .bg.operator::before{
          background:
            radial-gradient(1100px 700px at 80% 20%, rgba(16,90,54,0.7), rgba(16,90,54,0.0) 62%),
            radial-gradient(900px 500px at 20% 30%, rgba(247,184,78,0.45), rgba(247,184,78,0.0) 65%),
            radial-gradient(1200px 1200px at 50% 95%, rgba(0,0,0,0.78), rgba(0,0,0,0.92));
          filter: saturate(1.05) contrast(1.15) brightness(0.88);
        }
        .bg.operator::after{ background: conic-gradient(from 30deg at 40% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.08), rgba(255,255,255,0.04)); mix-blend-mode: overlay; opacity:.5; }

        /* Optional texture (very light noise) */
        @media (min-width:0px){
          .bg::after{ background-image:
            radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.03) 0, transparent 100%),
            radial-gradient(1px 1px at 80% 60%, rgba(0,0,0,0.03) 0, transparent 100%);
            background-size: 180px 180px, 220px 220px;
          }
        }

        /* Reduce motion */
        @media (prefers-reduced-motion: no-preference){
          .tile:hover{ transform: translateY(-2px); transition: transform .25s ease; }
          .tile:hover .tile{ box-shadow:0 22px 60px rgba(0,0,0,.22); }
        }

        /* FOOTER */
        .footer{ background:#0d0e0e; color:#e9ecef; border-top:1px solid rgba(255,255,255,0.08); }
        .footer::before{ content:""; display:block; height:3px; background:linear-gradient(90deg,var(--brand-a),var(--brand-b)); }
        .fwrap{ max-width:1320px; margin:0 auto; padding: clamp(22px,5vw,48px) 16px; display:grid; gap:10px; }
        .mantra{ display:flex; gap:12px; flex-wrap:wrap; align-items:baseline; letter-spacing:.06em; text-transform:uppercase; }
        .w{ font-weight:1000; font-size: clamp(22px,3.2vw,40px); }
        .dot{ opacity:.5; font-size: clamp(20px,3vw,36px); transform: translateY(-2px); }
        .meta{ color:#cfd4da; font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; }
      `}</style>
    </div>
  );
}
