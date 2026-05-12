import BrandLogo from "@/components/BrandLogo";

const FAN_LOGIN_URL = "/user/?prompt=login";
const CREATOR_LOGIN_URL = "/creator/?prompt=login";

const Footer = () => {
  return (
    <footer className="border-t border-border/60 bg-[#090c14] py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <BrandLogo />
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              A premium creator-access platform designed around subscriptions, PPV unlocks, direct
              fan relationships, and Kenya-first payment flows.
            </p>
          </div>

          <div className="grid gap-3 text-sm md:justify-items-end">
            <a className="landing-footer-link" href="/app/">
              Home
            </a>
            <a className="landing-footer-link" href={FAN_LOGIN_URL}>
              Explore creators
            </a>
            <a className="landing-footer-link" href={CREATOR_LOGIN_URL}>
              Become a creator
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6 text-xs text-muted-foreground">
          (c) 2026 SpicyX. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
