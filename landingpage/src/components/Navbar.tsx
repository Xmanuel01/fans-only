import { Button } from "@/components/ui/button";
import { Menu, Shield, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/86 backdrop-blur-2xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <a href="/app/" className="flex items-center gap-3" aria-label="SpicyX">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <div className="text-lg font-display font-bold tracking-tight text-foreground">SpicyX</div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Premium creator access
            </div>
          </div>
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          <a className="landing-nav-link" href="#why-spicyx">
            Why SpicyX
          </a>
          <a className="landing-nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="landing-nav-link" href="#creator-launch">
            Launch flow
          </a>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="hero-outline" size="sm" asChild className="rounded-full px-5">
            <a href="/user/">Explore Creators</a>
          </Button>
          <Button variant="hero" size="sm" asChild className="rounded-full px-5">
            <a href="/creator/">Become a Creator</a>
          </Button>
        </div>

        <button
          className="text-foreground md:hidden"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen(!mobileOpen)}
          type="button"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            id="mobile-navigation"
            className="border-t border-border/60 bg-background/95 md:hidden"
          >
            <div className="container mx-auto flex flex-col gap-3 px-4 py-5">
              <a className="landing-nav-link" href="#why-spicyx" onClick={() => setMobileOpen(false)}>
                Why SpicyX
              </a>
              <a className="landing-nav-link" href="#how-it-works" onClick={() => setMobileOpen(false)}>
                How it works
              </a>
              <a className="landing-nav-link" href="#creator-launch" onClick={() => setMobileOpen(false)}>
                Launch flow
              </a>
              <Button variant="hero-outline" size="sm" asChild className="mt-2 w-full rounded-full">
                <a href="/user/">Explore Creators</a>
              </Button>
              <Button variant="hero" size="sm" asChild className="w-full rounded-full">
                <a href="/creator/">Become a Creator</a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
