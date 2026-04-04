import Link from "next/link";
import {
  UploadCloud,
  Zap,
  Rocket,
  Check,
  ArrowRight,
} from "lucide-react";
import { HeroDemo } from "@/components/hero-demo";
import { SmoothScroll } from "@/components/smooth-scroll";

// ─── Plan data ──────────────────────────────────────────

const PLANS = [
  {
    key: "FREE",
    name: "Free",
    price: "$0",
    period: "",
    badge: null,
    features: [
      "1 project",
      "50 queries / day",
      "5 MB storage",
      "Community support",
    ],
    cta: "Get Started",
    href: "/login",
    highlight: false,
  },
  {
    key: "PRO",
    name: "Pro",
    price: "$29",
    period: "/mo",
    badge: "Most Popular",
    features: [
      "10 projects",
      "1,000 queries / day",
      "100 MB storage",
      "Custom branding",
      "Remove watermark",
      "Priority support",
    ],
    cta: "Start Free Trial",
    href: "/login",
    highlight: true,
  },
  {
    key: "TEAM",
    name: "Team",
    price: "$99",
    period: "/mo",
    badge: null,
    features: [
      "Unlimited projects",
      "10,000 queries / day",
      "1 GB storage",
      "API access",
      "Analytics dashboard",
      "Priority support",
      "Custom integrations",
    ],
    cta: "Start Free Trial",
    href: "/login",
    highlight: false,
  },
] as const;

// ─── Page ───────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <SmoothScroll />

      {/* ── Nav ────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            DropModel
          </Link>

          <div className="flex items-center gap-6">
            <a
              href="#pricing"
              className="hidden text-sm text-gray-600 transition-colors hover:text-gray-900 sm:block"
            >
              Pricing
            </a>
            <Link
              href="/login"
              className="hidden text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:block"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Get Started Free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h1 className="text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Drop your data.
            <br />
            Get an AI.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-gray-500">
            Turn any document into a deployed AI chatbot in 60&nbsp;seconds.
            No code. No ML knowledge. No infrastructure.
          </p>

          <div className="mt-10">
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-8 text-base font-medium text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-xl"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-sm text-gray-400">
              No credit card required
            </p>
          </div>

          {/* Interactive demo */}
          <HeroDemo />
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How it works
          </h2>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: UploadCloud,
                step: "1",
                title: "Drop your files",
                desc: "PDF, CSV, Word docs, or URLs. Just drag and drop.",
              },
              {
                icon: Zap,
                step: "2",
                title: "AI processes instantly",
                desc: "We automatically chunk, embed, and index your data. No configuration needed.",
              },
              {
                icon: Rocket,
                step: "3",
                title: "Deploy anywhere",
                desc: "Get an API endpoint and embeddable chat widget. Add to your site with one line of code.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                  <item.icon className="h-8 w-8 text-indigo-600" />
                </div>
                <h3 className="mt-5 text-lg font-bold">
                  {item.step}. {item.title}
                </h3>
                <p className="mt-2 text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── Pricing ───────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Simple pricing
            </h2>
            <p className="mt-3 text-lg text-gray-500">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`relative rounded-2xl border-2 p-8 ${
                  plan.highlight
                    ? "border-indigo-600 ring-2 ring-indigo-600 shadow-lg"
                    : "border-gray-200"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                    {plan.badge}
                  </span>
                )}

                <h3 className="text-lg font-semibold">{plan.name}</h3>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-gray-500">{plan.period}</span>
                  )}
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-gray-600"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href={plan.href}
                    className={`flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                      plan.highlight
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────── */}
      <section className="bg-gray-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to build your AI?
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Upload a document and get a chatbot in under a minute.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-8 text-base font-medium text-gray-900 transition-colors hover:bg-gray-100"
          >
            Start Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-8">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <p>&copy; {new Date().getFullYear()} DropModel</p>
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="transition-colors hover:text-gray-700">Features</a>
            <a href="#pricing" className="transition-colors hover:text-gray-700">Pricing</a>
            <a href="https://github.com/kkaufma72" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gray-700">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
