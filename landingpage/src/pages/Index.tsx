import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import BecomeCreatorCTA from "@/components/BecomeCreatorCTA";
import Footer from "@/components/Footer";
import { BadgeDollarSign, LockKeyhole, MessageSquareHeart, ShieldCheck, Sparkles, Video } from "lucide-react";
import { motion } from "framer-motion";

const platformCards = [
  {
    icon: ShieldCheck,
    title: "Protect premium content",
    copy: "Member-gated posts, PPV unlocks, and controlled previews keep premium access behind the right paywall.",
  },
  {
    icon: Video,
    title: "Run stories, reels, and drops",
    copy: "Publish video, image, and text content in one feed with faster story-style updates for your most active fans.",
  },
  {
    icon: BadgeDollarSign,
    title: "Collect in KES",
    copy: "Kenya-first wallet, M-PESA, and Paystack flows keep fan checkout and creator payouts close to the local market.",
  },
  {
    icon: MessageSquareHeart,
    title: "Keep the audience close",
    copy: "Private conversations, direct subscriptions, and premium unlocks are built around repeat fan spend.",
  },
];

const experienceBlocks = [
  {
    title: "Built for premium creator brands",
    copy: "Position subscriptions, locked drops, and direct fan access in a space that feels private, controlled, and premium.",
  },
  {
    title: "Made for controlled growth",
    copy: "Creators manage public content, subscriber-only content, and PPV content without exposing the full library for free.",
  },
  {
    title: "Operationally launch-ready",
    copy: "Wallet funding, subscription charging, and manual payout review are aligned for a real Kenya-first commercial rollout.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />

      <section className="relative border-y border-border/60 bg-[#0d1019] py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(191,149,62,0.08),transparent_40%)]" />
        <div className="container relative mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="landing-kicker">Why it feels premium</span>
            <h2 className="mt-4 text-3xl font-display font-bold text-foreground md:text-5xl">
              The landing page now sells the platform instead of just introducing it.
            </h2>
            <p className="mt-4 text-base leading-8 text-muted-foreground md:text-lg">
              This section is designed to feel closer to a premium adult-platform campaign page:
              more direct, more visual hierarchy, and less empty luxury filler.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {platformCards.map((card, index) => (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.08, duration: 0.5 }}
                className="landing-feature-card"
              >
                <div className="landing-feature-card__icon">
                  <card.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-xl font-display font-semibold text-foreground">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(191,149,62,0.1),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(191,149,62,0.08),transparent_30%)]" />
        <div className="container relative mx-auto px-4">
          <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="landing-story-panel">
              <span className="landing-kicker">Positioning</span>
              <h2 className="mt-4 max-w-xl text-3xl font-display font-bold leading-tight md:text-5xl">
                Built for creators who sell access, attention, and premium drops.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                The product story is now clearer: creators publish premium content, fans subscribe,
                unlock, and top up in KES, and payouts move through a reviewed destination instead of
                a vague generic flow.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {experienceBlocks.map((block) => (
                  <div key={block.title} className="landing-mini-panel">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="mt-4 text-lg font-display font-semibold text-foreground">{block.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{block.copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="landing-proof-stack">
              <div className="landing-proof-card">
                <span className="landing-proof-card__label">Subscriptions</span>
                <div className="landing-proof-card__value">Public, subscriber-only, or PPV</div>
                <p className="landing-proof-card__copy">
                  One content system for open discovery, member access, and paid unlocks.
                </p>
              </div>
              <div className="landing-proof-card">
                <span className="landing-proof-card__label">Payments</span>
                <div className="landing-proof-card__value">KES wallet with M-PESA and Paystack</div>
                <p className="landing-proof-card__copy">
                  Fan checkout is local-first, and creator payouts stay bound to reviewed payout rails.
                </p>
              </div>
              <div className="landing-proof-card">
                <span className="landing-proof-card__label">Operations</span>
                <div className="landing-proof-card__value">Manual payout review and retry-safe flows</div>
                <p className="landing-proof-card__copy">
                  The live product stays tighter by surfacing only the rails and workflows you can
                  actually support at launch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <BecomeCreatorCTA />
      <Footer />
    </div>
  );
};

export default Index;
