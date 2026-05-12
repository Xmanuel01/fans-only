import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, BadgeDollarSign, LockKeyhole, WalletCards } from "lucide-react";

const creatorPoints = [
  {
    icon: LockKeyhole,
    title: "Control every access layer",
    desc: "Use public, subscriber-only, and paid-unlock content without exposing premium drops for free.",
  },
  {
    icon: BadgeDollarSign,
    title: "Monetize in KES",
    desc: "Run subscription and PPV logic around the same wallet and local payment rails used by your fans.",
  },
  {
    icon: WalletCards,
    title: "Stay payout-review ready",
    desc: "Save a payout destination, pass manual ops review, and keep transfers aligned to a real launch workflow.",
  },
];
const FAN_LOGIN_URL = "/user/?prompt=login";
const CREATOR_LOGIN_URL = "/creator/?prompt=login";

const BecomeCreatorCTA = () => {
  return (
    <section id="creator-launch" className="relative overflow-hidden border-t border-border/60 py-24">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(191,149,62,0.12),transparent_26%),linear-gradient(180deg,#111522_0%,#0d1019_100%)]" />
      <div className="container relative mx-auto px-4">
        <div className="landing-cta-shell">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            className="landing-cta-copy"
          >
            <span className="landing-kicker">Creator launch workflow</span>
            <h2 className="mt-5 text-4xl font-display font-bold leading-tight text-foreground md:text-6xl">
              Turn premium attention into recurring spend, direct unlocks, and controlled payouts.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              The live product is now positioned around a tighter adult-platform workflow: publish,
              gate access, get paid in KES, and move revenue to reviewed payout rails.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {creatorPoints.map((point) => (
                <div key={point.title} className="landing-cta-point">
                  <point.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 text-lg font-display font-semibold text-foreground">{point.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{point.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            className="landing-cta-actions"
          >
            <div className="landing-cta-actions__panel">
              <span className="landing-cta-actions__label">Live launch direction</span>
              <div className="landing-cta-actions__headline">Kenya-first, KES-first, creator-first.</div>
              <p className="landing-cta-actions__copy">
                Start with the surfaces that can actually operate in production instead of exposing
                unfinished routes.
              </p>

              <div className="mt-8 space-y-3">
                <Button variant="hero" size="lg" className="w-full rounded-full py-6 text-base" asChild>
                  <a href={CREATOR_LOGIN_URL}>
                    Become a Creator <ArrowRight className="h-5 w-5" />
                  </a>
                </Button>
                <Button variant="hero-outline" size="lg" className="w-full rounded-full py-6 text-base" asChild>
                  <a href={FAN_LOGIN_URL}>Explore Creators</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BecomeCreatorCTA;
