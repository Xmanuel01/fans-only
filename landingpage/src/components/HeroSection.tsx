import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import { ArrowRight, BadgeDollarSign, LockKeyhole, MessageCircleMore } from "lucide-react";

const heroSignals = [
  { icon: LockKeyhole, label: "Subscriber and PPV control" },
  { icon: BadgeDollarSign, label: "KES-ready monetization" },
  { icon: MessageCircleMore, label: "Direct premium fan access" },
];
const FAN_LOGIN_URL = "/user/?prompt=login";
const CREATOR_LOGIN_URL = "/creator/?prompt=login";

const HeroSection = () => {
  return (
    <section id="why-spicyx" className="relative overflow-hidden pt-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(191,149,62,0.18),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(191,149,62,0.08),transparent_24%),linear-gradient(180deg,#080a12_0%,#0a0d16_48%,#090c14_100%)]" />
      <div className="absolute inset-y-0 left-0 w-[40vw] bg-[radial-gradient(circle_at_left,rgba(191,149,62,0.08),transparent_60%)]" />

      <div className="container relative mx-auto px-4 pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <span className="landing-kicker">Premium fan monetization platform</span>
            <h1 className="mt-6 text-5xl font-display font-bold leading-[0.98] text-foreground md:text-7xl">
              Launch a creator business that feels private, premium, and built to sell access.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground md:text-lg">
              SpicyX is positioned for creators who monetize subscriptions, premium stories, direct
              chat, and paid unlocks without flattening the experience into a generic social app.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button variant="hero" size="lg" className="rounded-full px-8 py-6 text-base" asChild>
                <a href={CREATOR_LOGIN_URL}>
                  Become a Creator <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
              <Button variant="hero-outline" size="lg" className="rounded-full px-8 py-6 text-base" asChild>
                <a href={FAN_LOGIN_URL}>Explore Creators</a>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {heroSignals.map((signal) => (
                <div key={signal.label} className="landing-signal">
                  <signal.icon className="h-4 w-4 text-primary" />
                  <span>{signal.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 38 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="landing-hero-visual"
          >
            <div className="landing-hero-visual__glow" />
            <div className="landing-hero-visual__blend">
              <img
                src={heroBg}
                alt="Premium creator campaign visual"
                className="landing-hero-visual__image"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
