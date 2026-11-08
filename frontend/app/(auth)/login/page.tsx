"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!apiUrl) {
      setError("Sign in is not available yet. Please try again later.");
      return;
    }

    setPending(true);
    try {
      const phone = String(data.get("phone")).trim();
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The existing controller calls its phone argument "email".
        body: JSON.stringify({ email: phone, password: data.get("password") }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(response.status === 401
          ? "Incorrect phone number or password."
          : response.status === 403
            ? "Your account is inactive. Please contact support."
            : "Unable to sign in. Please try again.");
      }
      const user = result && typeof result === "object" && "user" in result ? result.user : null;
      if (!user || typeof user !== "object" || !("token" in user) || typeof user.token !== "string" || !user.token) {
        throw new Error("Unable to start your session. Please try again.");
      }
      sessionStorage.setItem("digirent_token", user.token);
      router.replace("/dashboard");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="signup-page" aria-labelledby="login-title">
      <div className="signup-card card-base">
        <header className="signup-heading">
          <p className="signup-brand text-primary">DIGIRENT</p>
          <h1 id="login-title" className="text-page-title">Welcome back</h1>
          <p className="text-body-sm">Sign in to manage your rent, properties, and leases.</p>
        </header>

        <form className="signup-form" onSubmit={handleSubmit}>
          <fieldset className="signup-fields" disabled={pending}>
            <div className="signup-field">
              <label htmlFor="login-phone" className="text-label">Phone number</label>
              <input id="login-phone" name="phone" type="tel" className="input-base" autoComplete="username" placeholder="+251911234567" required pattern="\+?[1-9][0-9]{10,14}" aria-describedby="login-phone-hint" />
              <p id="login-phone-hint" className="text-caption">Include your country code, without spaces.</p>
            </div>
            <div className="signup-field">
              <label htmlFor="login-password" className="text-label">Password</label>
              <div className="signup-password">
                <input id="login-password" name="password" type={showPassword ? "text" : "password"} className="input-base" autoComplete="current-password" required aria-describedby={error ? "login-error" : undefined} />
                <button type="button" className="signup-toggle text-primary" aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
              </div>
            </div>
          </fieldset>
          {error && <p id="login-error" className="signup-error text-body-sm" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-lg button-full" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
        </form>

        <p className="signup-footer text-body-sm">Don&apos;t have an account? <Link href="/signup" className="signup-link text-primary">Create account</Link></p>
      </div>
    </section>
  );
}
