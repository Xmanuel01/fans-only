import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import { ArrowRight, Shield, Star, Users } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-dark opacity-70" />

      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-3xl mx-auto"
        >
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium tracking-wider uppercase">
            The Premium Creator Platform
          </span>

          <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
            Where Creators{" "}
            <span className="text-gradient-gold">Thrive</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Monetize your content, build your community, and connect with fans on the most creator-friendly platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg" className="text-base px-8 py-6" asChild>
              <a href="/creator/">
                Start Creating <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
            <Button variant="hero-outline" size="lg" className="text-base px-8 py-6" asChild>
              <a href="/user/">Explore Creators</a>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto"
        >
          {[
            { icon: Users, label: "50K+ Creators", desc: "Active worldwide" },
            { icon: Shield, label: "SFW & NSFW", desc: "All content welcome" },
            { icon: Star, label: "85% Payout", desc: "Industry leading" },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-4">
              <stat.icon className="h-6 w-6 text-primary mb-1" />
              <span className="text-lg font-display font-semibold text-foreground">{stat.label}</span>
              <span className="text-sm text-muted-foreground">{stat.desc}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
