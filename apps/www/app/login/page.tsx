import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/login-form";
import { Wordmark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/creative/experience";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <main className="reference-login" id="main">
      <div className="login-topbar">
        <Link href="/">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </div>
      <div className="login-form-frame">
        <LoginForm />
      </div>
      <Link href="/" className="login-back">
        ← Back to StudPilot
      </Link>
    </main>
  );
}
