import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  showTagline?: boolean;
};

const BrandLogo = ({ className, compact = false, showTagline = true }: BrandLogoProps) => {
  return (
    <div className={cn("brand-logo", compact && "brand-logo--compact", className)}>
      <div className="brand-logo__row" aria-hidden="true">
        <span className="brand-logo__word">Spicy</span>
        <span className="brand-logo__mark">
          <span className="brand-logo__mark-glow" />
          <Flame className="brand-logo__flame" />
          <span className="brand-logo__x">X</span>
        </span>
      </div>
      {showTagline ? <div className="brand-logo__tag">Premium creator access</div> : null}
    </div>
  );
};

export default BrandLogo;
