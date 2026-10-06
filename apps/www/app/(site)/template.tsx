import { LandingFx } from "@/components/site/landing-fx";

// A template remounts on every navigation, so the page fades in and the scroll effects re-attach.
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="route-fade">
      <LandingFx />
      {children}
    </div>
  );
}
