import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp, DollarSign } from "lucide-react";

const BecomeCreatorCTA = () => {
  return (
    <section className="py-24 bg-card/50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium tracking-wider uppercase">
            For Creators
          </span>
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">
            Turn Your Passion Into <span className="text-gradient-gold">Income</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Join creators earning on their own terms. Share SFW or NSFW content -
            you're in control.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            {[
              { icon: DollarSign, title: "Reliable payouts", desc: "Built for creator businesses" },
              { icon: TrendingUp, title: "Grow Fast", desc: "Built-in discovery tools" },
              { icon: Sparkles, title: "Full Freedom", desc: "SFW & NSFW welcome" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-xl p-6 text-center"
              >
                <item.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-display font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <Button variant="hero" size="lg" className="text-base px-8 py-6" asChild>
            <a href="/creator/">
              Start Creating Today <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default BecomeCreatorCTA;
