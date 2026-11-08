"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Your passwords do not match.");
      return;
    }

    // Set the backend origin in NEXT_PUBLIC_API_URL when using a separate API server.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!apiUrl) {
      setError("Registration is not available yet. Please try again later.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name")).trim(),
          phone: String(data.get("phone")).trim(),
          password: data.get("password"),
          role: "user",
          businessRole: data.get("businessRole"),
        }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = result && typeof result === "object" && "error" in result
          && typeof result.error === "string" ? result.error : "Unable to create your account. Check your details and try again.";
        throw new Error(message);
      }
      form.reset();
      setCreated(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="signup-page" aria-labelledby="signup-title">
      <div className="signup-card card-base">
        <header className="signup-heading">
          <p className="signup-brand text-primary">DIGIRENT</p>
          <h1 id="signup-title" className="text-page-title">Create your account</h1>
          <p className="text-body-sm">Manage your rent, properties, and leases in one place.</p>
        </header>

        {created ? (
          <div className="signup-result" role="status">
            <h2 className="text-section-title">Your account is ready</h2>
            <p className="text-body-sm">Sign in to get started with DigiRent.</p>
            <Link href="/login" className="button button-primary button-md button-full">Go to sign in</Link>
          </div>
        ) : (
          <form className="signup-form" onSubmit={handleSubmit}>
            <fieldset className="signup-fields" disabled={pending}>
              <div className="signup-field">
                <label htmlFor="signup-name" className="text-label">Full name</label>
                <input id="signup-name" name="name" className="input-base" autoComplete="name" placeholder="Enter your full name" required minLength={2} maxLength={32} pattern=".*\S.*" />
              </div>
              <div className="signup-field">
                <label htmlFor="signup-phone" className="text-label">Phone number</label>
                <input id="signup-phone" name="phone" type="tel" className="input-base" autoComplete="tel" placeholder="+251911234567" required pattern="\+?[1-9][0-9]{10,14}" aria-describedby="signup-phone-hint" />
                <p id="signup-phone-hint" className="text-caption">Include your country code, without spaces.</p>
              </div>
              <div className="signup-field">
                <label htmlFor="signup-role" className="text-label">I am a</label>
                <select id="signup-role" name="businessRole" className="input-base" defaultValue="LANDLORD">
                  <option value="LANDLORD">Landlord</option>
                  <option value="TENANT">Tenant</option>
                </select>
              </div>
              <div className="signup-field">
                <label htmlFor="signup-password" className="text-label">Password</label>
                <div className="signup-password">
                  <input id="signup-password" name="password" type={showPassword ? "text" : "password"} className="input-base" autoComplete="new-password" required minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}" aria-describedby="signup-password-hint" />
                  <button type="button" className="signup-toggle text-primary" aria-controls="signup-password signup-confirm" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
                </div>
                <p id="signup-password-hint" className="text-caption">Use 8 or more characters with a letter, number, and symbol (!@#$%^&amp;*).</p>
              </div>
              <div className="signup-field">
                <label htmlFor="signup-confirm" className="text-label">Confirm password</label>
                <input id="signup-confirm" name="confirmPassword" type={showPassword ? "text" : "password"} className="input-base" autoComplete="new-password" required aria-describedby={error ? "signup-error" : undefined} />
              </div>
            </fieldset>
            {error && <p id="signup-error" className="signup-error text-body-sm" role="alert">{error}</p>}
            <button type="submit" className="button button-primary button-lg button-full" disabled={pending}>{pending ? "Creating account..." : "Create account"}</button>
          </form>
        )}
        <p className="signup-footer text-body-sm">Already have an account? <Link href="/login" className="signup-link text-primary">Sign in</Link></p>
      </div>
    </section>
  );
}
