import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import BecomeCreatorCTA from "@/components/BecomeCreatorCTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <BecomeCreatorCTA />
      <Footer />
    </div>
  );
};

export default Index;
