import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/login-form";
import { Wordmark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/creative/experience";
import { MotionControl } from "@/components/creative/atmosphere";
import { AssemblyScene } from "@/components/creative/assembly-scene";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <main className="reference-login" id="main">
      <div className="login-topbar">
        <Link href="/">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3"><MotionControl /><ThemeToggle /></div>
      </div>
      <div className="login-layout">
        <div className="login-scene">
          <AssemblyScene compact />
          <p className="workbench-eyebrow">AN IDEA IS ALL IT TAKES</p>
          <h2>Your next world.<br /><span className="luminous-text">Start here.</span></h2>
          <p>One creative workspace for the interfaces, mechanics and worlds you imagine.</p>
        </div>
        <div className="login-form-frame"><LoginForm /></div>
      </div>
      <Link href="/" className="login-back">
        ← Back to StudPilot
      </Link>
    </main>
  );
}
