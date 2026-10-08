import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { LoginForm } from "@/components/app/login-form";
import { Wordmark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/creative/experience";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <div className="login-experience">
      <aside className="login-scene">
        <Image
          src="/art/creation-world.webp"
          width={1600}
          height={900}
          alt="Original concept illustration of a floating world"
          className="login-world"
          sizes="50vw"
        />
        <Link href="/" className="w-fit">
          <Wordmark />
        </Link>
        <div>
          <div className="release-badge">
            <span className="signal-pulse" />A SPACE FOR YOUR IMAGINATION
          </div>
          <h2>
            Your ideas.
            <br />
            <span className="gradient-text">A world of possibility.</span>
          </h2>
          <p>
            A creative co-pilot for your Roblox project.
            <br />
            Start something new. Keep making it yours.
          </p>
        </div>
        <p className="text-[9px] text-muted-foreground">
          Original concept illustration · StudPilot
        </p>
      </aside>
      <main className="login-main" id="main">
        <div className="flex items-center justify-between">
          <Link href="/" className="login-mobile-logo">
            <Wordmark />
          </Link>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </div>
        <div className="login-form-frame rise">
          <LoginForm />
        </div>
        <Link href="/" className="login-back">
          <ArrowLeftIcon className="size-3" />
          Back to StudPilot
        </Link>
      </main>
    </div>
  );
}
