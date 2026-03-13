const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="text-center">
          <span className="text-gradient-gold text-xl font-display font-bold">SpicyX</span>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            The premium platform for creators and their fans.
          </p>
          <div className="mt-6 text-xs text-muted-foreground">
            (c) 2026 SpicyX. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
