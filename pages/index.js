import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState(null); // success | expired | null

  useEffect(() => {
    (async () => {
      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);

      // Handle email confirmation hash (optional UX)
      const hash = new URLSearchParams(window.location.hash.replace('#', ''));
      const type = hash.get('type');
      const errCode = hash.get('error_code');
      const errDesc = hash.get('error_description');
      if (type === 'signup') setConfirmMsg({ kind: 'success', text: 'Your email has been confirmed. Welcome to TalentLix!' });
      else if (errCode === 'otp_expired') setConfirmMsg({ kind: 'expired', text: decodeURIComponent(errDesc || 'Email link is invalid or has expired') });
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    })();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); setUser(null); };

  return (
    <div className="page">
      {/* TOP NAV */}
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <img src="/logo-talentlix.png" alt="TalentLix" className="logo" />
          </div>

          {/* Desktop menu */}
          <nav className="menu">
            <Link href="#features" className="link">Features</Link>
            <Link href="#how" className="link">How it works</Link>
            <Link href="#pricing" className="link">Pricing</Link>
            <Link href="#about" className="link">About</Link>
          </nav>

          {/* Right side */}
          <div className="actions">
            {!user ? (
              <>
                <Link href="/login" className="btn outline">Sign in</Link>
                <Link href="/register" className="btn fill">Get started</Link>
              </>
            ) : (
              <div className="userMenu">
                <button className="pill" onClick={() => setMenuOpen(!menuOpen)} aria-label="User menu">⋮</button>
                {menuOpen && (
                  <div className="dropdown">
                    <div className="dropdownUser">👤 {user.email}</div>
                    <Link href="/dashboard" className="dropdownItem">Go to Dashboard</Link>
                    <button onClick={logout} className="dropdownButton">Logout</button>
                  </div>
                )}
              </div>
            )}
            <button className="hamburger" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Open menu">
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileNavOpen && (
          <div className="mobileNav">
            <Link href="#features" className="mItem" onClick={() => setMobileNavOpen(false)}>Features</Link>
            <Link href="#how" className="mItem" onClick={() => setMobileNavOpen(false)}>How it works</Link>
            <Link href="#pricing" className="mItem" onClick={() => setMobileNavOpen(false)}>Pricing</Link>
            <Link href="#about" className="mItem" onClick={() => setMobileNavOpen(false)}>About</Link>
            {!user ? (
              <div className="mCTA">
                <Link href="/login" className="btn outline">Sign in</Link>
                <Link href="/register" className="btn fill">Get started</Link>
              </div>
            ) : (
              <div className="mCTA">
                <Link href="/dashboard" className="btn outline" onClick={() => setMobileNavOpen(false)}>Dashboard</Link>
                <button onClick={logout} className="btn fill">Logout</button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="overlay" />
        <div className="heroInner">
          {confirmMsg && (
            <div className={`alert ${confirmMsg.kind}`} role="status">{confirmMsg.text}</div>
          )}
          <h1 className="heroTitle">The global talent graph for sports</h1>
          <p className="heroSub">Showcase athletic careers. Discover talent. Connect clubs, agents and athletes worldwide — with a light social layer.</p>
          <div className="heroCTAs">
            <Link href="/register?role=athlete" className="btn fill lg">I’m an Athlete</Link>
            <Link href="/register?role=operator" className="btn ghost lg">I’m a Club / Agent</Link>
          </div>
          <div className="miniLinks">
            <Link href="/pulse" className="mini">What’s happening</Link>
            <span className="dot">•</span>
            <Link href="/login" className="mini">Already have an account? Sign in</Link>
          </div>
        </div>
      </section>

      {/* AUDIENCE SPLIT */}
      <section className="split" id="features">
        <div className="splitGrid">
          <div className="card audience">
            <div className="cardHead">
              <span className="emoji" aria-hidden>🏅</span>
              <h3>Athletes</h3>
            </div>
            <ul className="list">
              <li>Create a verified, media‑rich profile (photo, video, stats)</li>
              <li>Publish visibility status (Seeking Team / Open to offers)</li>
              <li>Inbox for inbound requests and system updates</li>
            </ul>
            <div className="cardCTAs">
              <Link href="/register?role=athlete" className="btn fill">Get started</Link>
              <Link href="/wizard" className="btn bare">See onboarding →</Link>
            </div>
          </div>

          <div className="card audience">
            <div className="cardHead">
              <span className="emoji" aria-hidden>🧭</span>
              <h3>Clubs & Agents</h3>
            </div>
            <ul className="list">
              <li>Powerful search with filters (sport, role, age, country, ranking)</li>
              <li>Shortlists & contact credits with clear usage</li>
              <li>Direct messaging with response metrics</li>
            </ul>
            <div className="cardCTAs">
              <Link href="/register?role=operator" className="btn outline">Create account</Link>
              <Link href="/login" className="btn bare">Sign in →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <h2>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="badge">1</div>
            <h4>Onboard fast</h4>
            <p>4‑step wizard, GDPR‑ready, with SMS phone verification.</p>
          </div>
          <div className="step">
            <div className="badge">2</div>
            <h4>Publish your profile</h4>
            <p>Go live with core details, then enrich with media and updates.</p>
          </div>
          <div className="step">
            <div className="badge">3</div>
            <h4>Get discovered</h4>
            <p>Operators search worldwide with ranking and availability signals.</p>
          </div>
          <div className="step">
            <div className="badge">4</div>
            <h4>Connect & track</h4>
            <p>Messaging with response speed metrics and contact history.</p>
          </div>
        </div>
      </section>

      {/* PRICING / CREDIT WALLET CTA */}
      <section className="pricing" id="pricing">
        <div className="pricingInner">
          <h2>Simple plans. Transparent credits.</h2>
          <p>Buy a credit wallet (castelletto). Each search, profile unlock or message deducts credits. Subscriptions lower unit costs and unlock pro filters.</p>
          <div className="heroCTAs">
            <Link href="/pricing" className="btn fill">View pricing</Link>
            <Link href="/register?role=operator" className="btn ghost">Start as Operator</Link>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="about" id="about">
        <div className="aboutGrid">
          <div className="aboutText">
            <h2>About TalentLix</h2>
            <p>We’re building the professional layer for athletes. Think LinkedIn for sports — multisport, international and search‑first, with a lean social feed that never gets in the way.</p>
            <ul className="ticks">
              <li>Next.js + Supabase stack</li>
              <li>Media storage with clean access policies</li>
              <li>Mobile‑ready design, app to follow</li>
            </ul>
          </div>
          <div className="aboutCard">
            <div className="kpi"><span className="kpiNum">4</span><span className="kpiLbl">step wizard</span></div>
            <div className="kpi"><span className="kpiNum">24/7</span><span className="kpiLbl">global access</span></div>
            <div className="kpi"><span className="kpiNum">∞</span><span className="kpiLbl">sports</span></div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="fgrid">
          <div className="fcol">
            <img src="/logo-talentlix.png" alt="TalentLix" className="logoSmall" />
            <p className="footCopy">© {new Date().getFullYear()} TalentLix. All rights reserved.</p>
          </div>
          <div className="fcol">
            <h5>Product</h5>
            <Link href="#features" className="footLink">Features</Link>
            <Link href="#how" className="footLink">How it works</Link>
            <Link href="#pricing" className="footLink">Pricing</Link>
          </div>
          <div className="fcol">
            <h5>Company</h5>
            <Link href="#about" className="footLink">About</Link>
            <Link href="/login" className="footLink">Sign in</Link>
            <Link href="/register" className="footLink">Get started</Link>
          </div>
        </div>
      </footer>

      {/* BACKGROUND */}
      <div className="bg" aria-hidden />

      <style jsx>{`
        :global(html, body, #__next) { height: 100%; }
        .page { position: relative; min-height: 100%; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0b0b0b; }

        /* Background image + soft overlay */
        .bg { position: fixed; inset: 0; background: url('/BackG.png') center/cover no-repeat; z-index: -2; }
        .hero::before { content: ""; position: absolute; inset: 0; background: rgba(255,255,255,0.65); z-index: -1; }

        /* NAV */
        .nav { position: sticky; top: 0; z-index: 20; backdrop-filter: saturate(120%) blur(6px); background: rgba(255,255,255,0.7); border-bottom: 1px solid #eaeaea; }
        .nav-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
        .brand { display: flex; align-items: center; gap: 10px; }
        .logo { width: 110px; height: auto; }
        .menu { display: none; gap: 18px; }
        .link { color: #222; text-decoration: none; font-weight: 600; }
        .link:hover { opacity: 0.7; }
        .actions { display: flex; align-items: center; gap: 10px; }
        .btn { display: inline-block; text-decoration: none; border-radius: 10px; padding: 10px 16px; font-weight: 800; }
        .btn.fill { background: linear-gradient(90deg,#27E3DA,#F7B84E); color: #fff; }
        .btn.outline { border: 2px solid #27E3DA; color: #27E3DA; }
        .btn.ghost { border: 2px solid #F0F0F0; color: #111; background: #fff; }
        .btn.bare { color: #111; font-weight: 700; }
        .btn.lg { padding: 12px 22px; border-radius: 12px; font-size: 1.05rem; }
        .pill { background: #27E3DA; color:#fff; width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
        .dropdown { position: absolute; right: 16px; top: 56px; background: #fff; border: 1px solid #E0E0E0; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); padding: 8px; min-width: 220px; }
        .dropdownUser { padding: 8px; border-bottom: 1px solid #eee; color:#444; }
        .dropdownItem { display: block; padding: 10px; text-decoration: none; color: #222; border-radius: 8px; }
        .dropdownItem:hover { background: #f6f6f6; }
        .dropdownButton { width: 100%; margin-top: 6px; background: #DD5555; color:#fff; border: 0; padding: 10px; border-radius: 8px; cursor: pointer; }
        .hamburger { display: inline-flex; flex-direction: column; gap: 4px; background: transparent; border: 0; padding: 8px; }
        .hamburger span { width: 22px; height: 2px; background: #111; display: block; }
        .mobileNav { display: grid; gap: 8px; padding: 12px 16px; border-top: 1px solid #ececec; background: rgba(255,255,255,0.9); }
        .mItem { text-decoration: none; color: #111; padding: 8px 0; font-weight: 700; }
        .mCTA { display: flex; gap: 8px; padding-top: 8px; }

        /* HERO */
        .hero { position: relative; padding: clamp(40px, 8vw, 80px) 16px; text-align: center; }
        .heroInner { max-width: 1080px; margin: 0 auto; }
        .alert { margin: 0 auto 16px; max-width: 720px; background: #FFF8E1; border: 1px solid #FFECB3; color: #5d4400; padding: 10px 14px; border-radius: 10px; }
        .alert.expired { background: #FDECEC; border-color:#F5C2C2; color:#6b1a1a; }
        .heroTitle { font-size: clamp(28px, 4vw, 52px); line-height: 1.08; font-weight: 900; margin: 0 0 10px; }
        .heroSub { font-size: clamp(16px, 2.2vw, 22px); color: #333; margin: 0 auto 18px; max-width: 820px; }
        .heroCTAs { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin: 18px 0 8px; }
        .miniLinks { display: flex; gap: 10px; justify-content: center; align-items: center; color: #333; margin-top: 6px; }
        .mini { color: #111; text-decoration: none; font-weight: 700; }
        .dot { opacity: 0.5; }

        /* SPLIT */
        .split { padding: clamp(32px, 7vw, 72px) 16px; }
        .splitGrid { display: grid; gap: 16px; max-width: 1080px; margin: 0 auto; grid-template-columns: 1fr; }
        .card { background: rgba(248, 249, 250, 0.95); border: 1px solid #E0E0E0; border-radius: 16px; padding: 22px; box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
        .audience { display: grid; gap: 12px; }
        .cardHead { display: flex; align-items: center; gap: 10px; }
        .emoji { font-size: 26px; }
        .list { margin: 0; padding-left: 16px; display: grid; gap: 8px; color: #222; }
        .cardCTAs { display: flex; gap: 10px; flex-wrap: wrap; }

        /* HOW */
        .how { padding: clamp(32px, 7vw, 72px) 16px; background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.92)); border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
        .how h2 { text-align: center; font-size: clamp(24px, 3vw, 36px); margin: 0 0 16px; }
        .steps { display: grid; gap: 12px; grid-template-columns: 1fr; max-width: 1080px; margin: 0 auto; }
        .step { background: #fff; border: 1px solid #eee; border-radius: 14px; padding: 18px; }
        .badge { width: 28px; height: 28px; border-radius: 50%; background: #27E3DA; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; margin-bottom: 8px; }

        /* PRICING CTA */
        .pricing { padding: clamp(32px, 7vw, 72px) 16px; text-align: center; }
        .pricingInner { max-width: 900px; margin: 0 auto; }
        .pricing h2 { font-size: clamp(24px, 3vw, 36px); margin: 0 0 10px; }

        /* ABOUT */
        .about { padding: clamp(32px, 7vw, 72px) 16px; }
        .aboutGrid { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; grid-template-columns: 1fr; }
        .aboutText { background: rgba(255,255,255,0.92); border: 1px solid #eee; border-radius: 16px; padding: 22px; }
        .ticks { margin: 12px 0 0; padding-left: 18px; display: grid; gap: 6px; }
        .aboutCard { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; align-items: stretch; }
        .kpi { background: rgba(248,249,250,0.95); border: 1px solid #E0E0E0; border-radius: 16px; padding: 16px; text-align: center; box-shadow: 0 6px 16px rgba(0,0,0,0.05); }
        .kpiNum { display: block; font-size: 28px; font-weight: 900; }
        .kpiLbl { color: #444; }

        /* FOOTER */
        .footer { border-top: 1px solid #eee; background: rgba(255,255,255,0.8); padding: 24px 16px; }
        .fgrid { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; grid-template-columns: 1fr; }
        .fcol h5 { margin: 0 0 8px; font-size: 14px; color: #444; }
        .logoSmall { width: 90px; height: auto; }
        .footCopy { color: #444; margin-top: 8px; }
        .footLink { display: block; text-decoration: none; color: #111; margin: 6px 0; }

        /* RESPONSIVE */
        @media (min-width: 760px) {
          .menu { display: flex; }
          .hamburger { display: none; }
          .splitGrid { grid-template-columns: 1fr 1fr; }
          .steps { grid-template-columns: repeat(4,1fr); }
          .aboutGrid { grid-template-columns: 1.5fr 1fr; }
          .fgrid { grid-template-columns: 1fr auto auto; }
        }
      `}</style>
    </div>
  );
}
