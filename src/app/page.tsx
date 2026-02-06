import { HeroSection } from "@/components/home/HeroSection";
import { WorkGrid } from "@/components/home/WorkGrid";
import { AboutSection } from "@/components/home/AboutSection";
import { ProjectsGrid } from "@/components/home/ProjectsGrid";
import { ConnectSection } from "@/components/home/ConnectSection";

export default function Home() {
  return (
    <>
      <HeroSection />
      <WorkGrid />
      <AboutSection />
      <ProjectsGrid />
      <ConnectSection />
    </>
  );
}
