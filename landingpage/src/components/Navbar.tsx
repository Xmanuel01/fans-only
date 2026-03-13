import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <a href="/app/" className="flex items-center gap-2">
          <span className="text-gradient-gold text-2xl font-display font-bold tracking-tight">SpicyX</span>
        </a>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="hero-outline" size="sm" asChild>
            <a href="/user/">Explore Creators</a>
          </Button>
          <Button variant="hero" size="sm" asChild>
            <a href="/creator/">Become a Creator</a>
          </Button>
        </div>

        <button
          className="md:hidden text-foreground"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen(!mobileOpen)}
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
            className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-4 p-4">
              <Button variant="hero-outline" size="sm" asChild className="w-full">
                <a href="/user/">Explore Creators</a>
              </Button>
              <Button variant="hero" size="sm" asChild className="w-full">
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
