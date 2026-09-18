import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calm AI — Somewhere to start at 2am" },
      {
        name: "description",
        content:
          "An AI companion for the days between appointments — chat or talk, guided exercises, and mood tracking. Not therapy, and it says so.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  // Signed-in users who land here are sent straight to the app.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
    });
  }, [navigate]);

  // Scroll-reveal + shrinking-nav enhancement, ported from the design mock.
  // Purely cosmetic — skipped entirely for prefers-reduced-motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const page = document.getElementById("ca-page");
    const nav = document.getElementById("ca-nav");
    if (!page || !nav) return;

    const blocks = (Array.from(page.children) as HTMLElement[]).filter((c) => c !== nav);
    if (!blocks.length) return;

    const units: Array<[HTMLElement, number]> = [];
    blocks.forEach((block) => {
      const grid = block.querySelector<HTMLElement>('div[style*="grid-template-columns"]');
      const kids =
        grid && grid.children.length > 1 ? (Array.from(grid.children) as HTMLElement[]) : null;
      if (kids) {
        const head = (Array.from(block.children) as HTMLElement[]).filter(
          (c) => c !== grid && !c.contains(grid),
        );
        head.forEach((h) => units.push([h, 0]));
        kids.forEach((k, i) => units.push([k, i * 90]));
      } else {
        units.push([block, 0]);
      }
    });

    units.forEach(([el, delay]) => {
      el.dataset["caDelay"] = String(delay);
      el.style.opacity = "0";
      el.style.transform = "translateY(26px)";
      el.style.willChange = "opacity, transform";
    });

    const reveal = (el: HTMLElement) => {
      if (el.dataset["caShown"]) return;
      el.dataset["caShown"] = "1";
      setTimeout(
        () => {
          el.style.transition =
            "opacity .85s cubic-bezier(.2,.8,.2,1), transform .85s cubic-bezier(.2,.8,.2,1)";
          el.style.opacity = "1";
          el.style.transform = "none";
          setTimeout(() => {
            el.style.willChange = "auto";
          }, 900);
        },
        Number(el.dataset["caDelay"] || 0),
      );
    };

    const pill = nav.querySelector<HTMLElement>(":scope > div");
    nav.style.transition = "padding .4s cubic-bezier(.2,.8,.2,1)";
    if (pill) pill.style.transition = "box-shadow .4s, background .4s";

    const update = () => {
      const h = window.innerHeight;
      units.forEach(([el]) => {
        if (el.dataset["caShown"]) return;
        const r = el.getBoundingClientRect();
        if (r.top < h * 0.9 && r.bottom > 0) reveal(el);
      });
      const past = window.scrollY > 40;
      nav.style.padding = past ? "10px 20px" : "16px 20px";
      if (pill) {
        pill.style.boxShadow = past
          ? "0 26px 54px -24px rgba(23,23,40,.9)"
          : "0 18px 40px -22px rgba(23,23,40,.8)";
      }
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    let raf: number | undefined;
    if (typeof requestAnimationFrame === "function") {
      const tick = () => {
        update();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    const failsafe = setTimeout(() => units.forEach(([el]) => reveal(el)), 2500);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(failsafe);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <style>{`#ca-page{font-family:Manrope,system-ui,sans-serif}
#ca-page a{color:#5b60c4;text-decoration:none}
#ca-page a:hover{color:#3f4499}
@keyframes caBreathe{0%,100%{transform:scale(.95)}50%{transform:scale(1.06)}}
@keyframes caFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes caDrift{0%{transform:translate(-50%,0) scale(1)}50%{transform:translate(-50%,26px) scale(1.08)}100%{transform:translate(-50%,0) scale(1)}}
@keyframes caOrb{0%{transform:translate(0,0) scale(1)}33%{transform:translate(28px,-18px) scale(1.06)}66%{transform:translate(-22px,14px) scale(.96)}100%{transform:translate(0,0) scale(1)}}
@keyframes caSheen{0%{transform:translateX(-120%) skewX(-18deg)}100%{transform:translateX(320%) skewX(-18deg)}}
@keyframes caRing{0%{opacity:.5;transform:scale(.9)}70%{opacity:0;transform:scale(1.35)}100%{opacity:0;transform:scale(1.35)}}
.ca-hov-1:hover{color:#fff}
.ca-hov-2:hover{color:#fff}
.ca-hov-3:hover{color:#fff}
.ca-hov-4:hover{color:#fff}
.ca-hov-5:hover{background:#dedef6}
.ca-hov-6:hover{transform:translateY(-2px)}
.ca-hov-7:hover{transform:translateY(-2px)}
.ca-hov-8:hover{transform:translateY(-6px);box-shadow:0 30px 60px -34px rgba(90,95,180,.6)}
.ca-hov-9:hover{transform:translateY(-6px);box-shadow:0 30px 60px -34px rgba(90,95,180,.6)}
.ca-hov-10:hover{transform:translateY(-6px);box-shadow:0 30px 60px -34px rgba(90,95,180,.6)}
.ca-hov-11:hover{transform:translateY(-6px);box-shadow:0 34px 66px -32px rgba(90,95,180,.8)}
.ca-hov-12:hover{transform:translateY(-6px);box-shadow:0 34px 66px -32px rgba(90,95,180,.8)}
.ca-hov-13:hover{transform:translateY(-6px);box-shadow:0 34px 66px -32px rgba(90,95,180,.8)}
.ca-hov-14:hover{transform:translateY(-5px);box-shadow:0 28px 56px -34px rgba(90,95,180,.7)}
.ca-hov-15:hover{transform:translateY(-5px);box-shadow:0 28px 56px -34px rgba(90,95,180,.7)}
.ca-hov-16:hover{transform:translateY(-4px);box-shadow:0 24px 48px -32px rgba(143,59,59,.45)}
.ca-hov-17:hover{transform:translateY(-4px);box-shadow:0 24px 48px -32px rgba(143,59,59,.45)}
.ca-hov-18:hover{transform:translateY(-4px);box-shadow:0 24px 48px -32px rgba(143,59,59,.45)}
.ca-hov-19:hover{transform:translateY(-6px);box-shadow:0 34px 66px -34px rgba(90,95,180,.7)}
.ca-hov-20:hover{background:rgba(23,23,40,.12)}
.ca-hov-21:hover{transform:translateY(-8px);box-shadow:0 46px 90px -30px rgba(23,23,40,.95)}
.ca-hov-22:hover{background:#dedef6}
.ca-hov-23:hover{transform:translateY(-6px);box-shadow:0 34px 66px -34px rgba(90,95,180,.7)}
.ca-hov-24:hover{background:#2a2a42}
.ca-hov-25:hover{transform:translateY(-2px)}
.ca-hov-26:hover{transform:translateY(-2px)}
.ca-hov-27:hover{transform:translateY(-2px)}
.ca-hov-28:hover{transform:translateY(-2px)}
.ca-hov-29:hover{background:#dedef6}
.ca-hov-30:hover{color:#fff}
.ca-hov-31:hover{color:#fff}
.ca-hov-32:hover{color:#fff}
.ca-hov-33:hover{color:#fff}
.ca-hov-34:hover{color:#fff}
.ca-hov-35:hover{color:#fff}
.ca-hov-36:hover{color:#fff}
.ca-hov-37:hover{color:#fff}
.ca-hov-38:hover{color:#fff}
.ca-hov-39:hover{color:#fff}
.ca-hov-40:hover{color:#fff}`}</style>
      <div id="ca-page" style={{ width: "100%", overflowX: "clip", background: "#f4f4fb" }}>
        <div
          id="ca-nav"
          style={{
            position: "sticky",
            top: "0",
            zIndex: "50",
            display: "flex",
            justifyContent: "center",
            padding: "16px 20px",
            background: "linear-gradient(180deg,rgba(244,244,251,.95),rgba(244,244,251,0))",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1120px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "10px 12px 10px 20px",
              borderRadius: "999px",
              background: "rgba(23,23,40,.94)",
              boxShadow: "0 18px 40px -22px rgba(23,23,40,.8)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "none" }}>
              <svg width="26" height="26" viewBox="0 0 100 100">
                <path
                  d="M25,27 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M48,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M25,73 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M2,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0"
                  fill="#9ea1e6"
                ></path>
                <circle cx="50" cy="50" r="15" fill="#171728"></circle>
              </svg>
              <span
                style={{
                  font: "800 17px Manrope,sans-serif",
                  color: "#fff",
                  letterSpacing: "-.4px",
                }}
              >
                Calm <span style={{ color: "#9ea1e6" }}>AI</span>
              </span>
            </div>
            <div
              style={{
                flex: "1",
                display: "flex",
                justifyContent: "center",
                gap: "26px",
                flexWrap: "wrap",
              }}
            >
              <a
                href="#how"
                className="ca-hov-1"
                style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,.72)" }}
              >
                How it works
              </a>
              <a
                href="#features"
                className="ca-hov-2"
                style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,.72)" }}
              >
                Features
              </a>
              <a
                href="#safety"
                className="ca-hov-3"
                style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,.72)" }}
              >
                Safety
              </a>
              <a
                href="#pricing"
                className="ca-hov-4"
                style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,.72)" }}
              >
                Pricing
              </a>
            </div>
            <Link
              to="/auth"
              style={{
                flex: "none",
                fontSize: "14px",
                fontWeight: "600",
                color: "rgba(255,255,255,.72)",
              }}
            >
              Sign in
            </Link>
            <a
              href="#download"
              className="ca-hov-5"
              style={{
                flex: "none",
                padding: "11px 20px",
                borderRadius: "999px",
                background: "#fff",
                fontSize: "14px",
                fontWeight: "700",
                color: "#171728",
              }}
            >
              Download
            </a>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "48px 24px 0",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-260px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(1100px,150vw)",
              height: "760px",
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(143,148,224,.34),transparent 62%)",
              animation: "caDrift 22s ease-in-out infinite",
            }}
          ></div>
          <div
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "nowrap",
              justifyContent: "center",
              alignItems: "center",
              gap: "9px",
              padding: "8px 16px",
              borderRadius: "999px",
              background: "rgba(255,255,255,.86)",
              border: "1px solid #fff",
              boxShadow: "0 10px 26px -18px rgba(90,95,180,.6)",
            }}
          >
            <div
              style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#5b60c4" }}
            ></div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "#3f4160",
                whiteSpace: "nowrap",
              }}
            >
              Free — eight messages a day, no card
            </span>
          </div>
          <h1
            style={{
              position: "relative",
              margin: "22px 0 0",
              font: "800 clamp(38px,6.4vw,74px) Manrope,sans-serif",
              color: "#171728",
              letterSpacing: "-2.6px",
              lineHeight: "1.02",
              maxWidth: "860px",
              textWrap: "pretty",
            }}
          >
            Somewhere to start
            <br />
            at 2am
          </h1>
          <p
            style={{
              position: "relative",
              margin: "20px 0 0",
              fontSize: "clamp(16px,2.1vw,21px)",
              lineHeight: "1.55",
              color: "#4a4c6b",
              maxWidth: "600px",
              textWrap: "pretty",
            }}
          >
            An AI companion for the days between appointments — or before you've managed to book
            one. Type, or actually talk. It's not therapy, and it says so.
          </p>
          <div
            style={{
              position: "relative",
              marginTop: "30px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "center",
            }}
          >
            <a
              href="#"
              className="ca-hov-6"
              style={{
                transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                padding: "14px 24px",
                borderRadius: "16px",
                background: "#171728",
                boxShadow: "0 18px 40px -20px rgba(23,23,40,.8)",
              }}
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,.14)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <div
                  style={{ width: "11px", height: "11px", borderRadius: "3px", background: "#fff" }}
                ></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                <span
                  style={{
                    font: "500 9px IBM Plex Mono,monospace",
                    color: "#9ea1e6",
                    letterSpacing: ".12em",
                  }}
                >
                  DOWNLOAD ON THE
                </span>
                <span
                  style={{
                    font: "800 17px Manrope,sans-serif",
                    color: "#fff",
                    letterSpacing: "-.4px",
                  }}
                >
                  App Store
                </span>
              </div>
            </a>
            <a
              href="#"
              className="ca-hov-7"
              style={{
                transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                padding: "14px 24px",
                borderRadius: "16px",
                background: "#171728",
                boxShadow: "0 18px 40px -20px rgba(23,23,40,.8)",
              }}
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,.14)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <svg width="12" height="13" viewBox="0 0 12 13">
                  <path d="M1 1 L11 6.5 L1 12 Z" fill="#fff"></path>
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                <span
                  style={{
                    font: "500 9px IBM Plex Mono,monospace",
                    color: "#9ea1e6",
                    letterSpacing: ".12em",
                  }}
                >
                  GET IT ON
                </span>
                <span
                  style={{
                    font: "800 17px Manrope,sans-serif",
                    color: "#fff",
                    letterSpacing: "-.4px",
                  }}
                >
                  Google Play
                </span>
              </div>
            </a>
          </div>
          <div
            style={{
              position: "relative",
              marginTop: "14px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "14px", color: "#4a4c6b" }}>
              Signing up is free — no card.
            </span>
            <a href="#how" style={{ fontSize: "14px", fontWeight: "700", color: "#5b60c4" }}>
              See how it works →
            </a>
          </div>

          <div
            style={{
              position: "relative",
              marginTop: "56px",
              width: "100%",
              maxWidth: "1000px",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              gap: "clamp(-40px,-2vw,0px)",
              minHeight: "420px",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "60px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(360px,52%)",
                aspectRatio: "1",
                borderRadius: "50%",
                border: "1px solid rgba(91,96,196,.3)",
                animation: "caRing 5.5s ease-out infinite",
                pointerEvents: "none",
              }}
            ></div>
            <div
              style={{
                position: "absolute",
                bottom: "60px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(360px,52%)",
                aspectRatio: "1",
                borderRadius: "50%",
                border: "1px solid rgba(91,96,196,.24)",
                animation: "caRing 5.5s ease-out 2.2s infinite",
                pointerEvents: "none",
              }}
            ></div>
            <div
              style={{
                width: "clamp(150px,20vw,232px)",
                borderRadius: "36px",
                padding: "8px",
                background: "linear-gradient(160deg,#fff,#eeeef9)",
                boxShadow: "0 30px 70px -32px rgba(70,74,150,.5)",
                transform: "rotate(-7deg) translateY(24px)",
                flex: "none",
                animation: "caFloat 8s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  borderRadius: "29px",
                  overflow: "hidden",
                  background: "#f4f4fb",
                  aspectRatio: "736/1600",
                }}
              >
                <img
                  src="/shots/exercises.jpeg"
                  alt="Calm AI exercises"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    display: "block",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                width: "clamp(190px,25vw,290px)",
                borderRadius: "44px",
                padding: "9px",
                background: "linear-gradient(160deg,#fff,#eaeaf7)",
                boxShadow: "0 44px 90px -30px rgba(70,74,150,.6)",
                position: "relative",
                zIndex: "2",
                flex: "none",
              }}
            >
              <div
                style={{
                  borderRadius: "36px",
                  overflow: "hidden",
                  background: "#f4f4fb",
                  aspectRatio: "736/1600",
                }}
              >
                <img
                  src="/shots/precall.jpeg"
                  alt="Calm AI call setup"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    display: "block",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                width: "clamp(150px,20vw,232px)",
                borderRadius: "36px",
                padding: "8px",
                background: "linear-gradient(160deg,#fff,#eeeef9)",
                boxShadow: "0 30px 70px -32px rgba(70,74,150,.5)",
                transform: "rotate(7deg) translateY(24px)",
                flex: "none",
                animation: "caFloat 8s ease-in-out 1.4s infinite",
              }}
            >
              <div
                style={{
                  borderRadius: "29px",
                  overflow: "hidden",
                  background: "#f4f4fb",
                  aspectRatio: "736/1600",
                }}
              >
                <img
                  src="/shots/progress.jpeg"
                  alt="Calm AI progress"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          id="how"
          style={{
            padding: "clamp(72px,10vw,124px) 24px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: "1120px" }}>
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                whiteSpace: "nowrap",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
                background: "rgba(255,255,255,.9)",
                border: "1px solid #fff",
                font: "500 11px IBM Plex Mono,monospace",
                color: "#4a4c6b",
                letterSpacing: ".14em",
              }}
            >
              HOW IT WORKS
            </div>
            <div
              style={{
                marginTop: "20px",
                display: "flex",
                flexWrap: "wrap",
                gap: "24px",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  margin: "0",
                  font: "800 clamp(28px,4.2vw,46px) Manrope,sans-serif",
                  color: "#171728",
                  letterSpacing: "-1.6px",
                  lineHeight: "1.08",
                  maxWidth: "560px",
                  textWrap: "pretty",
                }}
              >
                Three minutes, not a<br />
                twelve-week programme
              </h2>
              <p
                style={{
                  margin: "0",
                  fontSize: "17px",
                  lineHeight: "1.6",
                  color: "#4a4c6b",
                  maxWidth: "380px",
                }}
              >
                No onboarding marathon. You're talking to someone before you've finished deciding
                whether you want to.
              </p>
            </div>
            <div
              style={{
                marginTop: "36px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,270px),1fr))",
                gap: "18px",
              }}
            >
              <div
                className="ca-hov-8"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: "28px",
                  padding: "28px",
                  background: "linear-gradient(160deg,#e9e9f9,#dcdcf4)",
                  minHeight: "300px",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  style={{
                    font: "500 12px IBM Plex Mono,monospace",
                    color: "#5b60c4",
                    letterSpacing: ".14em",
                  }}
                >
                  01
                </span>
                <div
                  style={{
                    flex: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "22px 0",
                  }}
                >
                  <div
                    style={{
                      width: "76px",
                      height: "76px",
                      borderRadius: "26px",
                      background: "#fff",
                      boxShadow: "0 16px 34px -18px rgba(90,95,180,.7)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "14px",
                        height: "24px",
                        borderRadius: "7px",
                        background: "#5b60c4",
                      }}
                    ></div>
                  </div>
                </div>
                <div
                  style={{
                    font: "800 22px Manrope,sans-serif",
                    color: "#171728",
                    letterSpacing: "-.6px",
                  }}
                >
                  Say what's happening
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "15px",
                    lineHeight: "1.55",
                    color: "#4a4c6b",
                  }}
                >
                  Type it, or hold the mic and ramble. No form to fill in first.
                </p>
              </div>
              <div
                className="ca-hov-9"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: "28px",
                  padding: "28px",
                  background: "linear-gradient(160deg,#efe9f9,#e4dcf4)",
                  minHeight: "300px",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  style={{
                    font: "500 12px IBM Plex Mono,monospace",
                    color: "#5b60c4",
                    letterSpacing: ".14em",
                  }}
                >
                  02
                </span>
                <div
                  style={{
                    flex: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "22px 0",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "96px",
                      height: "96px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: "0",
                        borderRadius: "50%",
                        background: "radial-gradient(circle,rgba(255,255,255,.95),transparent 70%)",
                        animation: "caBreathe 6s ease-in-out infinite",
                      }}
                    ></div>
                    <svg
                      width="52"
                      height="52"
                      viewBox="0 0 100 100"
                      style={{ position: "relative" }}
                    >
                      <path
                        d="M25,27 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M48,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M25,73 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M2,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0"
                        fill="#8f94e0"
                      ></path>
                      <circle cx="50" cy="50" r="15" fill="#eae4f7"></circle>
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    font: "800 22px Manrope,sans-serif",
                    color: "#171728",
                    letterSpacing: "-.6px",
                  }}
                >
                  It asks, then listens
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "15px",
                    lineHeight: "1.55",
                    color: "#4a4c6b",
                  }}
                >
                  Questions, not platitudes. It remembers what you said last time.
                </p>
              </div>
              <div
                className="ca-hov-10"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: "28px",
                  padding: "28px",
                  background: "linear-gradient(160deg,#e9f0f9,#dce6f4)",
                  minHeight: "300px",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  style={{
                    font: "500 12px IBM Plex Mono,monospace",
                    color: "#5b60c4",
                    letterSpacing: ".14em",
                  }}
                >
                  03
                </span>
                <div
                  style={{
                    flex: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "22px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      width: "100%",
                      maxWidth: "170px",
                    }}
                  >
                    <div
                      style={{
                        height: "14px",
                        borderRadius: "7px",
                        background: "rgba(91,96,196,.85)",
                      }}
                    ></div>
                    <div
                      style={{
                        height: "14px",
                        borderRadius: "7px",
                        background: "rgba(91,96,196,.5)",
                        width: "78%",
                      }}
                    ></div>
                    <div
                      style={{
                        height: "14px",
                        borderRadius: "7px",
                        background: "rgba(91,96,196,.3)",
                        width: "52%",
                      }}
                    ></div>
                  </div>
                </div>
                <div
                  style={{
                    font: "800 22px Manrope,sans-serif",
                    color: "#171728",
                    letterSpacing: "-.6px",
                  }}
                >
                  Leave with one thing
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "15px",
                    lineHeight: "1.55",
                    color: "#4a4c6b",
                  }}
                >
                  A three-minute exercise, or a sentence worth keeping. Not homework.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          id="features"
          style={{
            padding: "clamp(72px,10vw,124px) 24px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: "1120px" }}>
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                whiteSpace: "nowrap",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
                background: "rgba(255,255,255,.9)",
                border: "1px solid #fff",
                font: "500 11px IBM Plex Mono,monospace",
                color: "#4a4c6b",
                letterSpacing: ".14em",
              }}
            >
              FEATURES
            </div>
            <h2
              style={{
                margin: "20px 0 0",
                font: "800 clamp(28px,4.2vw,46px) Manrope,sans-serif",
                color: "#171728",
                letterSpacing: "-1.6px",
                lineHeight: "1.08",
                maxWidth: "620px",
                textWrap: "pretty",
              }}
            >
              Everything quiet. Nothing that nags.
            </h2>

            <div
              style={{
                marginTop: "36px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "18px",
              }}
            >
              <div
                style={{
                  borderRadius: "32px",
                  padding: "34px",
                  background: "#171728",
                  display: "flex",
                  flexDirection: "column",
                  gap: "26px",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-140px",
                    right: "-100px",
                    width: "420px",
                    height: "420px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle,rgba(140,145,225,.3),transparent 66%)",
                    animation: "caOrb 24s ease-in-out infinite",
                  }}
                ></div>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      font: "500 11px IBM Plex Mono,monospace",
                      color: "#9ea1e6",
                      letterSpacing: ".14em",
                    }}
                  >
                    LIVE CALLS
                  </span>
                  <div
                    style={{
                      marginTop: "14px",
                      font: "800 clamp(24px,3vw,34px) Manrope,sans-serif",
                      color: "#fff",
                      letterSpacing: "-1.2px",
                      lineHeight: "1.08",
                    }}
                  >
                    Some things you
                    <br />
                    can't type
                  </div>
                  <p
                    style={{
                      margin: "12px 0 0",
                      fontSize: "16px",
                      lineHeight: "1.55",
                      color: "#9ea1e6",
                      maxWidth: "380px",
                    }}
                  >
                    Voice only, or a video avatar if a face helps. Live captions throughout. Nothing
                    is recorded — only a short summary, and you can delete it.
                  </p>
                </div>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "-90px",
                  }}
                >
                  <div
                    style={{
                      width: "min(240px,70%)",
                      borderRadius: "34px",
                      padding: "8px",
                      background: "linear-gradient(160deg,#3a3a55,#22223a)",
                      boxShadow: "0 30px 60px -22px rgba(0,0,0,.7)",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "27px",
                        overflow: "hidden",
                        background: "#f4f4fb",
                        aspectRatio: "736/1600",
                      }}
                    >
                      <img
                        src="/shots/incall.jpeg"
                        alt="Calm AI live call"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "top",
                          display: "block",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "18px", alignContent: "start" }}>
                <div
                  className="ca-hov-11"
                  style={{
                    borderRadius: "28px",
                    padding: "28px",
                    background: "rgba(255,255,255,.88)",
                    border: "1px solid #fff",
                    boxShadow: "0 20px 46px -34px rgba(90,95,180,.5)",
                    transition:
                      "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                  }}
                >
                  <span
                    style={{
                      font: "500 11px IBM Plex Mono,monospace",
                      color: "#5b60c4",
                      letterSpacing: ".14em",
                    }}
                  >
                    CRISIS SCREENING
                  </span>
                  <div
                    style={{
                      marginTop: "12px",
                      font: "800 22px Manrope,sans-serif",
                      color: "#171728",
                      letterSpacing: "-.6px",
                    }}
                  >
                    It knows when to stop being clever
                  </div>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "15px",
                      lineHeight: "1.55",
                      color: "#4a4c6b",
                    }}
                  >
                    Every message is checked for crisis language before the companion answers. When
                    it sees it, you get real humans and real numbers.
                  </p>
                </div>
                <div
                  className="ca-hov-12"
                  style={{
                    borderRadius: "28px",
                    padding: "28px",
                    background: "rgba(255,255,255,.88)",
                    border: "1px solid #fff",
                    boxShadow: "0 20px 46px -34px rgba(90,95,180,.5)",
                    transition:
                      "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                  }}
                >
                  <span
                    style={{
                      font: "500 11px IBM Plex Mono,monospace",
                      color: "#5b60c4",
                      letterSpacing: ".14em",
                    }}
                  >
                    TWELVE EXERCISES
                  </span>
                  <div
                    style={{
                      marginTop: "12px",
                      font: "800 22px Manrope,sans-serif",
                      color: "#171728",
                      letterSpacing: "-.6px",
                    }}
                  >
                    Three to ten minutes, paced for you
                  </div>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "15px",
                      lineHeight: "1.55",
                      color: "#4a4c6b",
                    }}
                  >
                    Box breathing, 5-4-3-2-1 grounding, thought records, an evening journal. Leave
                    any of them halfway.
                  </p>
                </div>
                <div
                  className="ca-hov-13"
                  style={{
                    borderRadius: "28px",
                    padding: "28px",
                    background: "rgba(255,255,255,.88)",
                    border: "1px solid #fff",
                    boxShadow: "0 20px 46px -34px rgba(90,95,180,.5)",
                    transition:
                      "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                  }}
                >
                  <span
                    style={{
                      font: "500 11px IBM Plex Mono,monospace",
                      color: "#5b60c4",
                      letterSpacing: ".14em",
                    }}
                  >
                    PATTERNS, NOT STREAKS
                  </span>
                  <div
                    style={{
                      marginTop: "12px",
                      font: "800 22px Manrope,sans-serif",
                      color: "#171728",
                      letterSpacing: "-.6px",
                    }}
                  >
                    PHQ-9 and GAD-7, when they're due
                  </div>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "15px",
                      lineHeight: "1.55",
                      color: "#4a4c6b",
                    }}
                  >
                    Mood over the week and habits you chose yourself. Export the lot as a PDF for a
                    doctor's appointment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "clamp(72px,10vw,120px) 24px 0",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1120px",
              borderRadius: "36px",
              padding: "clamp(32px,5vw,56px)",
              background: "linear-gradient(160deg,#eeeefb,#dedef6)",
              border: "1px solid #fff",
            }}
          >
            <h2
              style={{
                margin: "0",
                font: "800 clamp(26px,3.6vw,40px) Manrope,sans-serif",
                color: "#171728",
                letterSpacing: "-1.4px",
                lineHeight: "1.08",
                maxWidth: "520px",
                textWrap: "pretty",
              }}
            >
              The numbers we can actually stand behind
            </h2>
            <div
              style={{
                marginTop: "36px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))",
                gap: "24px",
              }}
            >
              <div>
                <div
                  style={{
                    font: "800 clamp(34px,5vw,52px) Manrope,sans-serif",
                    color: "#5b60c4",
                    letterSpacing: "-2px",
                    lineHeight: "1",
                  }}
                >
                  8
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "#3f4160",
                  }}
                >
                  free messages a day, resetting at midnight
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "800 clamp(34px,5vw,52px) Manrope,sans-serif",
                    color: "#5b60c4",
                    letterSpacing: "-2px",
                    lineHeight: "1",
                  }}
                >
                  12
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "#3f4160",
                  }}
                >
                  guided exercises, 3–10 minutes each
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "800 clamp(34px,5vw,52px) Manrope,sans-serif",
                    color: "#5b60c4",
                    letterSpacing: "-2px",
                    lineHeight: "1",
                  }}
                >
                  3
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "#3f4160",
                  }}
                >
                  languages — English, العربية, Français
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "800 clamp(34px,5vw,52px) Manrope,sans-serif",
                    color: "#5b60c4",
                    letterSpacing: "-2px",
                    lineHeight: "1",
                  }}
                >
                  0
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "15px",
                    lineHeight: "1.5",
                    color: "#3f4160",
                  }}
                >
                  calls recorded, ads served, or streaks to keep alive
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "clamp(72px,10vw,120px) 24px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: "1120px" }}>
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                whiteSpace: "nowrap",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
                background: "rgba(255,255,255,.9)",
                border: "1px solid #fff",
                font: "500 11px IBM Plex Mono,monospace",
                color: "#4a4c6b",
                letterSpacing: ".14em",
              }}
            >
              THE VOICE
            </div>
            <h2
              style={{
                margin: "20px 0 0",
                font: "800 clamp(28px,4.2vw,46px) Manrope,sans-serif",
                color: "#171728",
                letterSpacing: "-1.6px",
                lineHeight: "1.08",
                maxWidth: "600px",
                textWrap: "pretty",
              }}
            >
              What it actually sounds like
            </h2>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: "17px",
                lineHeight: "1.6",
                color: "#4a4c6b",
                maxWidth: "560px",
              }}
            >
              Real lines from the app — no affirmations, no exclamation marks, no pretending to be
              your therapist.
            </p>
            <div
              style={{
                marginTop: "34px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
                gap: "18px",
              }}
            >
              <div
                className="ca-hov-14"
                style={{
                  borderRadius: "26px",
                  padding: "28px",
                  background: "rgba(255,255,255,.9)",
                  border: "1px solid #fff",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    font: "800 clamp(19px,2.3vw,23px) Manrope,sans-serif",
                    color: "#171728",
                    letterSpacing: "-.5px",
                    lineHeight: "1.35",
                  }}
                >
                  "So the week has been running you, more than you've been running it."
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    font: "500 11px IBM Plex Mono,monospace",
                    color: "#5b60c4",
                    letterSpacing: ".12em",
                  }}
                >
                  MID-CALL, 10:07PM
                </div>
              </div>
              <div style={{ borderRadius: "26px", padding: "28px", background: "#171728" }}>
                <div
                  style={{
                    font: "800 clamp(19px,2.3vw,23px) Manrope,sans-serif",
                    color: "#fff",
                    letterSpacing: "-.5px",
                    lineHeight: "1.35",
                  }}
                >
                  "Take your time. I'm still here."
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    font: "500 11px IBM Plex Mono,monospace",
                    color: "#9ea1e6",
                    letterSpacing: ".12em",
                  }}
                >
                  WHEN YOU GO QUIET MID-SENTENCE
                </div>
              </div>
              <div
                className="ca-hov-15"
                style={{
                  borderRadius: "26px",
                  padding: "28px",
                  background: "rgba(255,255,255,.9)",
                  border: "1px solid #fff",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    font: "800 clamp(19px,2.3vw,23px) Manrope,sans-serif",
                    color: "#171728",
                    letterSpacing: "-.5px",
                    lineHeight: "1.35",
                  }}
                >
                  "Let's take it apart together. What's the thought, word for word?"
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    font: "500 11px IBM Plex Mono,monospace",
                    color: "#5b60c4",
                    letterSpacing: ".12em",
                  }}
                >
                  STARTING A THOUGHT RECORD
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="safety"
          style={{
            padding: "clamp(72px,10vw,120px) 24px 0",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1120px",
              borderRadius: "36px",
              padding: "clamp(32px,5vw,52px)",
              background: "linear-gradient(160deg,#fdf6f3,#f4ebe7)",
              border: "1px solid rgba(143,59,59,.12)",
            }}
          >
            <span
              style={{
                font: "500 11px IBM Plex Mono,monospace",
                color: "#7a5f57",
                letterSpacing: ".14em",
              }}
            >
              IF IT'S HEAVIER THAN AN APP
            </span>
            <h2
              style={{
                margin: "16px 0 0",
                font: "800 clamp(26px,3.6vw,40px) Manrope,sans-serif",
                color: "#3a2521",
                letterSpacing: "-1.4px",
                lineHeight: "1.08",
                maxWidth: "520px",
                textWrap: "pretty",
              }}
            >
              You don't have to hold this alone
            </h2>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: "17px",
                lineHeight: "1.6",
                color: "#6d534c",
                maxWidth: "620px",
              }}
            >
              Calm AI is wellness support — not therapy, not a diagnosis, not emergency care. If
              you're in danger, please use one of these instead.
            </p>
            <div
              style={{
                marginTop: "28px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))",
                gap: "14px",
              }}
            >
              <div
                className="ca-hov-16"
                style={{
                  borderRadius: "22px",
                  padding: "22px 24px",
                  background: "rgba(255,255,255,.92)",
                  border: "1px solid rgba(143,59,59,.14)",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    font: "800 21px Manrope,sans-serif",
                    color: "#5b3d36",
                    letterSpacing: "-.5px",
                  }}
                >
                  Call or text 988
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    color: "#7a5f57",
                  }}
                >
                  Suicide &amp; Crisis Lifeline (US) · 24/7
                </div>
              </div>
              <div
                className="ca-hov-17"
                style={{
                  borderRadius: "22px",
                  padding: "22px 24px",
                  background: "rgba(255,255,255,.92)",
                  border: "1px solid rgba(143,59,59,.14)",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    font: "800 21px Manrope,sans-serif",
                    color: "#5b3d36",
                    letterSpacing: "-.5px",
                  }}
                >
                  Text HOME to 741741
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    color: "#7a5f57",
                  }}
                >
                  Crisis Text Line · a trained counsellor
                </div>
              </div>
              <div
                className="ca-hov-18"
                style={{
                  borderRadius: "22px",
                  padding: "22px 24px",
                  background: "rgba(255,255,255,.92)",
                  border: "1px solid rgba(143,59,59,.14)",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    font: "800 21px Manrope,sans-serif",
                    color: "#5b3d36",
                    letterSpacing: "-.5px",
                  }}
                >
                  findahelpline.com
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    color: "#7a5f57",
                  }}
                >
                  A free line in your own country
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="pricing"
          style={{
            padding: "clamp(72px,10vw,120px) 24px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: "1120px" }}>
            <div
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                whiteSpace: "nowrap",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
                background: "rgba(255,255,255,.9)",
                border: "1px solid #fff",
                font: "500 11px IBM Plex Mono,monospace",
                color: "#4a4c6b",
                letterSpacing: ".14em",
              }}
            >
              PRICING
            </div>
            <div
              style={{
                marginTop: "20px",
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  margin: "0",
                  font: "800 clamp(28px,4.2vw,46px) Manrope,sans-serif",
                  color: "#171728",
                  letterSpacing: "-1.6px",
                  lineHeight: "1.08",
                  maxWidth: "520px",
                  textWrap: "pretty",
                }}
              >
                Signing up is free.
                <br />
                It stays free.
              </h2>
              <p
                style={{
                  margin: "0",
                  fontSize: "17px",
                  lineHeight: "1.6",
                  color: "#4a4c6b",
                  maxWidth: "360px",
                }}
              >
                Download, talk tonight, and only pay when eight messages a day stops being enough.
              </p>
            </div>

            <div
              style={{
                marginTop: "36px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
                gap: "18px",
                alignItems: "stretch",
              }}
            >
              <div
                className="ca-hov-19"
                style={{
                  borderRadius: "32px",
                  padding: "32px",
                  background: "rgba(255,255,255,.9)",
                  border: "1px solid #fff",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  style={{
                    font: "500 11px IBM Plex Mono,monospace",
                    color: "#4a4c6b",
                    letterSpacing: ".14em",
                  }}
                >
                  FREE
                </span>
                <div
                  style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "7px" }}
                >
                  <span
                    style={{
                      font: "800 clamp(30px,4vw,42px) Manrope,sans-serif",
                      color: "#171728",
                      letterSpacing: "-1.8px",
                      lineHeight: "1",
                    }}
                  >
                    $0
                  </span>
                  <span style={{ fontSize: "14.5px", color: "#4a4c6b" }}>forever</span>
                </div>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: "14.5px",
                    lineHeight: "1.55",
                    color: "#4a4c6b",
                  }}
                >
                  No card to sign up. No trial timer counting down at you.
                </p>
                <div
                  style={{
                    marginTop: "22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Eight messages a
                    day, resetting at midnight
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Four guided
                    exercises
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Mood &amp; habit
                    tracking
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>30 days of history
                  </div>
                </div>
                <div style={{ flex: "1", minHeight: "20px" }}></div>
                <a
                  href="#download"
                  className="ca-hov-20"
                  style={{
                    marginTop: "22px",
                    padding: "15px",
                    borderRadius: "16px",
                    background: "rgba(23,23,40,.06)",
                    textAlign: "center",
                    fontSize: "15px",
                    fontWeight: "700",
                    color: "#171728",
                  }}
                >
                  Download &amp; start free
                </a>
              </div>

              <div
                className="ca-hov-21"
                style={{
                  borderRadius: "32px",
                  padding: "32px",
                  background: "#171728",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 34px 74px -30px rgba(23,23,40,.85)",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "0",
                    bottom: "0",
                    width: "26%",
                    background:
                      "linear-gradient(90deg,transparent,rgba(255,255,255,.09),transparent)",
                    animation: "caSheen 7s ease-in-out 1.5s infinite",
                    pointerEvents: "none",
                  }}
                ></div>
                <div
                  style={{
                    position: "absolute",
                    top: "-150px",
                    right: "-110px",
                    width: "420px",
                    height: "420px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle,rgba(140,145,225,.32),transparent 66%)",
                    animation: "caOrb 28s ease-in-out infinite",
                  }}
                ></div>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "9px",
                  }}
                >
                  <span
                    style={{
                      font: "500 11px IBM Plex Mono,monospace",
                      color: "#9ea1e6",
                      letterSpacing: ".14em",
                    }}
                  >
                    PLUS
                  </span>
                  <span
                    style={{
                      padding: "4px 9px",
                      borderRadius: "999px",
                      background: "rgba(158,161,230,.22)",
                      font: "500 10px IBM Plex Mono,monospace",
                      color: "#9ea1e6",
                      letterSpacing: ".1em",
                    }}
                  >
                    MOST PEOPLE START HERE
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    marginTop: "14px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "7px",
                  }}
                >
                  <span
                    style={{
                      font: "800 clamp(30px,4vw,42px) Manrope,sans-serif",
                      color: "#fff",
                      letterSpacing: "-1.8px",
                      lineHeight: "1",
                    }}
                  >
                    $18
                  </span>
                  <span style={{ fontSize: "14.5px", color: "#9ea1e6" }}>/ month</span>
                </div>
                <p
                  style={{
                    position: "relative",
                    margin: "10px 0 0",
                    fontSize: "14.5px",
                    lineHeight: "1.55",
                    color: "#9ea1e6",
                  }}
                >
                  Unlimited chat and voice, for talking whenever it hits.
                </p>
                <div
                  style={{
                    position: "relative",
                    marginTop: "22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#fff",
                    }}
                  >
                    <span style={{ color: "#9ea1e6", fontWeight: "700" }}>·</span>Unlimited messages
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#fff",
                    }}
                  >
                    <span style={{ color: "#9ea1e6", fontWeight: "700" }}>·</span>Unlimited voice
                    calls
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#fff",
                    }}
                  >
                    <span style={{ color: "#9ea1e6", fontWeight: "700" }}>·</span>All twelve
                    exercises
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#fff",
                    }}
                  >
                    <span style={{ color: "#9ea1e6", fontWeight: "700" }}>·</span>Full history,
                    exportable as PDF
                  </div>
                </div>
                <div style={{ flex: "1", minHeight: "20px" }}></div>
                <a
                  href="#download"
                  className="ca-hov-22"
                  style={{
                    position: "relative",
                    marginTop: "22px",
                    padding: "15px",
                    borderRadius: "16px",
                    background: "#fff",
                    textAlign: "center",
                    fontSize: "15px",
                    fontWeight: "700",
                    color: "#171728",
                  }}
                >
                  Get Plus
                </a>
                <span
                  style={{
                    position: "relative",
                    marginTop: "10px",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "#7b7d9e",
                  }}
                >
                  Cancel anytime
                </span>
              </div>

              <div
                className="ca-hov-23"
                style={{
                  borderRadius: "32px",
                  padding: "32px",
                  background: "linear-gradient(160deg,#eeeefb,#dcdcf4)",
                  border: "1px solid #fff",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  style={{
                    font: "500 11px IBM Plex Mono,monospace",
                    color: "#4a4c6b",
                    letterSpacing: ".14em",
                  }}
                >
                  COMPLETE
                </span>
                <div
                  style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "7px" }}
                >
                  <span
                    style={{
                      font: "800 clamp(30px,4vw,42px) Manrope,sans-serif",
                      color: "#171728",
                      letterSpacing: "-1.8px",
                      lineHeight: "1",
                    }}
                  >
                    $50
                  </span>
                  <span style={{ fontSize: "14.5px", color: "#4a4c6b" }}>/ month</span>
                </div>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: "14.5px",
                    lineHeight: "1.55",
                    color: "#4a4c6b",
                  }}
                >
                  Everything, including the face-to-face video companion.
                </p>
                <div
                  style={{
                    marginTop: "22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Everything in Plus
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Unlimited video
                    avatar calls
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Weekly recap &amp;
                    pattern report
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      fontSize: "14.5px",
                      lineHeight: "1.45",
                      color: "#171728",
                    }}
                  >
                    <span style={{ color: "#5b60c4", fontWeight: "700" }}>·</span>Priority support
                  </div>
                </div>
                <div style={{ flex: "1", minHeight: "20px" }}></div>
                <a
                  href="#download"
                  className="ca-hov-24"
                  style={{
                    marginTop: "22px",
                    padding: "15px",
                    borderRadius: "16px",
                    background: "#171728",
                    textAlign: "center",
                    fontSize: "15px",
                    fontWeight: "700",
                    color: "#fff",
                  }}
                >
                  Get Complete
                </a>
                <span
                  style={{
                    marginTop: "10px",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "#5c5e7d",
                  }}
                >
                  Cancel anytime
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          id="download"
          style={{
            padding: "clamp(80px,11vw,130px) 24px clamp(60px,8vw,90px)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "1120px",
              borderRadius: "40px",
              padding: "clamp(40px,6vw,72px) clamp(28px,5vw,56px)",
              background: "linear-gradient(160deg,#f7f7fd,#dcdcf4)",
              border: "1px solid #fff",
              overflow: "hidden",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "-220px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(760px,120%)",
                height: "520px",
                borderRadius: "50%",
                background: "radial-gradient(circle,rgba(143,148,224,.34),transparent 64%)",
                animation: "caDrift 26s ease-in-out infinite",
              }}
            ></div>
            <div
              style={{
                position: "relative",
                width: "84px",
                height: "84px",
                borderRadius: "26px",
                background: "linear-gradient(150deg,#8f94e0,#c9cbf2)",
                boxShadow: "0 22px 44px -16px rgba(90,95,180,.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="48" height="48" viewBox="0 0 100 100">
                <path
                  d="M25,27 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M48,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M25,73 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M2,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0"
                  fill="#fff"
                ></path>
                <circle cx="50" cy="50" r="15" fill="#a3a7e6"></circle>
              </svg>
            </div>
            <h2
              style={{
                position: "relative",
                margin: "26px 0 0",
                font: "800 clamp(30px,5vw,58px) Manrope,sans-serif",
                color: "#171728",
                letterSpacing: "-2.2px",
                lineHeight: "1.02",
                maxWidth: "620px",
                textWrap: "pretty",
              }}
            >
              Talk tonight.
              <br />
              It's free to start.
            </h2>
            <p
              style={{
                position: "relative",
                margin: "18px 0 0",
                fontSize: "clamp(16px,2vw,19px)",
                lineHeight: "1.55",
                color: "#4a4c6b",
                maxWidth: "480px",
              }}
            >
              Two taps from a conversation. No password, no card, no streak to keep alive.
            </p>
            <div
              style={{
                position: "relative",
                marginTop: "28px",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <a
                href="#"
                className="ca-hov-25"
                style={{
                  transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "14px 24px",
                  borderRadius: "16px",
                  background: "#171728",
                  boxShadow: "0 18px 40px -20px rgba(23,23,40,.8)",
                }}
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,.14)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <div
                    style={{
                      width: "11px",
                      height: "11px",
                      borderRadius: "3px",
                      background: "#fff",
                    }}
                  ></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                  <span
                    style={{
                      font: "500 9px IBM Plex Mono,monospace",
                      color: "#9ea1e6",
                      letterSpacing: ".12em",
                    }}
                  >
                    DOWNLOAD ON THE
                  </span>
                  <span
                    style={{
                      font: "800 17px Manrope,sans-serif",
                      color: "#fff",
                      letterSpacing: "-.4px",
                    }}
                  >
                    App Store
                  </span>
                </div>
              </a>
              <a
                href="#"
                className="ca-hov-26"
                style={{
                  transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "14px 24px",
                  borderRadius: "16px",
                  background: "#171728",
                  boxShadow: "0 18px 40px -20px rgba(23,23,40,.8)",
                }}
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,.14)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <svg width="12" height="13" viewBox="0 0 12 13">
                    <path d="M1 1 L11 6.5 L1 12 Z" fill="#fff"></path>
                  </svg>
                </div>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                  <span
                    style={{
                      font: "500 9px IBM Plex Mono,monospace",
                      color: "#9ea1e6",
                      letterSpacing: ".12em",
                    }}
                  >
                    GET IT ON
                  </span>
                  <span
                    style={{
                      font: "800 17px Manrope,sans-serif",
                      color: "#fff",
                      letterSpacing: "-.4px",
                    }}
                  >
                    Google Play
                  </span>
                </div>
              </a>
            </div>
            <span
              style={{
                position: "relative",
                marginTop: "14px",
                fontSize: "14px",
                color: "#4a4c6b",
              }}
            >
              Free to sign up · iOS and Android
            </span>
          </div>
        </div>

        <div style={{ padding: "0 24px 24px", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "100%",
              maxWidth: "1120px",
              borderRadius: "36px",
              padding: "clamp(32px,4.5vw,52px)",
              background: "#171728",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
                gap: "36px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <svg width="26" height="26" viewBox="0 0 100 100">
                    <path
                      d="M25,27 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M48,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M25,73 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0 M2,50 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0"
                      fill="#9ea1e6"
                    ></path>
                    <circle cx="50" cy="50" r="15" fill="#171728"></circle>
                  </svg>
                  <span
                    style={{
                      font: "800 18px Manrope,sans-serif",
                      color: "#fff",
                      letterSpacing: "-.4px",
                    }}
                  >
                    Calm <span style={{ color: "#9ea1e6" }}>AI</span>
                  </span>
                </div>
                <p
                  style={{
                    margin: "14px 0 0",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9ea1e6",
                    maxWidth: "260px",
                  }}
                >
                  A quiet place to think out loud. Wellness support, not therapy.
                </p>
                <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <a
                    href="#"
                    className="ca-hov-27"
                    style={{
                      transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                      padding: "11px 18px",
                      borderRadius: "16px",
                      background: "#fff",
                      border: "1px solid rgba(23,23,40,.1)",
                    }}
                  >
                    <div
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "8px",
                        background: "rgba(23,23,40,.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                      }}
                    >
                      <div
                        style={{
                          width: "11px",
                          height: "11px",
                          borderRadius: "3px",
                          background: "#171728",
                        }}
                      ></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                      <span
                        style={{
                          font: "500 9px IBM Plex Mono,monospace",
                          color: "#5c5e7d",
                          letterSpacing: ".12em",
                        }}
                      >
                        DOWNLOAD ON THE
                      </span>
                      <span
                        style={{
                          font: "800 15px Manrope,sans-serif",
                          color: "#171728",
                          letterSpacing: "-.4px",
                        }}
                      >
                        App Store
                      </span>
                    </div>
                  </a>
                  <a
                    href="#"
                    className="ca-hov-28"
                    style={{
                      transition: "transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s",
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                      padding: "11px 18px",
                      borderRadius: "16px",
                      background: "#fff",
                      border: "1px solid rgba(23,23,40,.1)",
                    }}
                  >
                    <div
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "8px",
                        background: "rgba(23,23,40,.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                      }}
                    >
                      <svg width="12" height="13" viewBox="0 0 12 13">
                        <path d="M1 1 L11 6.5 L1 12 Z" fill="#171728"></path>
                      </svg>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
                      <span
                        style={{
                          font: "500 9px IBM Plex Mono,monospace",
                          color: "#5c5e7d",
                          letterSpacing: ".12em",
                        }}
                      >
                        GET IT ON
                      </span>
                      <span
                        style={{
                          font: "800 15px Manrope,sans-serif",
                          color: "#171728",
                          letterSpacing: "-.4px",
                        }}
                      >
                        Google Play
                      </span>
                    </div>
                  </a>
                </div>
                <div
                  style={{
                    marginTop: "18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "9px",
                    maxWidth: "280px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "5px 5px 5px 16px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,.08)",
                    }}
                  >
                    <span style={{ flex: "1", fontSize: "13px", color: "rgba(255,255,255,.55)" }}>
                      your@email.com
                    </span>
                    <a
                      href="#"
                      className="ca-hov-29"
                      style={{
                        padding: "9px 16px",
                        borderRadius: "999px",
                        background: "#fff",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#171728",
                      }}
                    >
                      Subscribe
                    </a>
                  </div>
                  <span style={{ fontSize: "11.5px", color: "#7b7d9e", paddingLeft: "4px" }}>
                    Occasional notes on what we're building. Never daily.
                  </span>
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "500 10.5px IBM Plex Mono,monospace",
                    color: "#7b7d9e",
                    letterSpacing: ".14em",
                  }}
                >
                  PRODUCT
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <a
                    href="#how"
                    className="ca-hov-30"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    How it works
                  </a>
                  <a
                    href="#features"
                    className="ca-hov-31"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Features
                  </a>
                  <a
                    href="#pricing"
                    className="ca-hov-32"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Pricing
                  </a>
                  <a
                    href="#"
                    className="ca-hov-33"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Exercises
                  </a>
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "500 10.5px IBM Plex Mono,monospace",
                    color: "#7b7d9e",
                    letterSpacing: ".14em",
                  }}
                >
                  TRUST
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <a
                    href="#safety"
                    className="ca-hov-34"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Safety &amp; crisis
                  </a>
                  <a
                    href="#"
                    className="ca-hov-35"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    How the AI works
                  </a>
                  <Link
                    to="/legal"
                    className="ca-hov-36"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Privacy notice
                  </Link>
                  <Link
                    to="/legal"
                    className="ca-hov-37"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Terms
                  </Link>
                </div>
              </div>
              <div>
                <div
                  style={{
                    font: "500 10.5px IBM Plex Mono,monospace",
                    color: "#7b7d9e",
                    letterSpacing: ".14em",
                  }}
                >
                  ELSEWHERE
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <a
                    href="#"
                    className="ca-hov-38"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Instagram
                  </a>
                  <a
                    href="#"
                    className="ca-hov-39"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Support
                  </a>
                  <a
                    href="#"
                    className="ca-hov-40"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,.82)" }}
                  >
                    Press
                  </a>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: "40px",
                paddingTop: "22px",
                borderTop: "1px solid rgba(255,255,255,.14)",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  font: "500 11px IBM Plex Mono,monospace",
                  color: "#7b7d9e",
                  letterSpacing: ".12em",
                }}
              >
                CALMAI.SITE · © 2026
              </span>
              <span style={{ fontSize: "13px", color: "#9ea1e6" }}>
                In crisis? Call or text 988 (US)
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
