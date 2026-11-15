"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Step = "phone" | "code" | "password" | "done";

export default function ActivateTenantPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function post(action: string, body: object) {
    const response = await fetch(`/api/v1/auth/tenant/activation/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Unable to activate your account. Please try again.");
    return result;
  }

  async function run(work: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again."); }
    finally { submitting.current = false; setPending(false); }
  }

  async function sendCode() {
    await run(async () => {
      const result = await post("start", { phone: phone.trim() });
      if (typeof result?.challengeId !== "string") throw new Error("Unable to request a code. Please try again.");
      setChallengeId(result.challengeId);
      setSetupToken("");
      setCooldown(60);
      setMessage("If an eligible tenant account matches your number, you will receive an SMS code. It expires in 10 minutes.");
      setStep("code");
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (step === "phone") { void sendCode(); return; }
    void run(async () => {
      if (step === "code") {
        const result = await post("verify", { challengeId, code: String(data.get("code") || "").trim() });
        if (typeof result?.setupToken !== "string") throw new Error("Unable to verify your code. Please try again.");
        setSetupToken(result.setupToken);
        setMessage("Phone verified. Set your password within 10 minutes.");
        setStep("password");
      } else if (step === "password") {
        if (data.get("password") !== data.get("confirmPassword")) throw new Error("Your passwords do not match.");
        await post("password", { challengeId, setupToken, password: data.get("password") });
        form.reset();
        setSetupToken(""); setChallengeId(""); setMessage(""); setStep("done");
      }
    });
  }

  function restart() {
    setStep("phone"); setSetupToken(""); setChallengeId(""); setMessage(""); setError("");
  }

  return (
    <section className="signup-page" aria-labelledby="activation-title">
      <div className="signup-card card-base">
        <header className="signup-heading">
          <p className="signup-brand text-primary">DIGIRENT</p>
          <h1 id="activation-title" className="text-page-title">Activate your tenant account</h1>
          <p className="text-body-sm">Use the phone number your landlord recorded for your lease.</p>
        </header>
        {step === "done" ? (
          <div className="signup-result" role="status">
            <h2 className="text-section-title">Your account is ready</h2>
            <p className="text-body-sm">Sign in with your phone number and new password to view your rental agreements and payments.</p>
            <Link href="/login" className="button button-primary button-md button-full">Go to sign in</Link>
          </div>
        ) : (
          <form className="signup-form" onSubmit={submit}>
            <p className="text-caption">Step {step === "phone" ? 1 : step === "code" ? 2 : 3} of 3: {step === "phone" ? "Phone number" : step === "code" ? "Verify your phone" : "Create your password"}</p>
            {message && <p className="text-body-sm" role="status">{message}</p>}
            <fieldset className="signup-fields" disabled={pending}>
              {step === "phone" && (
                <div className="signup-field">
                  <label htmlFor="activation-phone" className="text-label">Phone number</label>
                  <input id="activation-phone" name="phone" type="tel" className="input-base" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+251911234567" required maxLength={32} aria-describedby="activation-phone-hint" />
                  <p id="activation-phone-hint" className="text-caption">Include your country code, or use an Ethiopian local number such as 0911234567. Requesting a code sends an SMS to this number.</p>
                </div>
              )}
              {step === "code" && (
                <div className="signup-field">
                  <label htmlFor="activation-code" className="text-label">SMS verification code</label>
                  <input key={challengeId} id="activation-code" name="code" className="input-base" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{4,10}" minLength={4} maxLength={10} aria-describedby="activation-code-hint" />
                  <p id="activation-code-hint" className="text-caption">Enter the code sent to {phone}. After five unsuccessful attempts, wait 15 minutes before requesting another code.</p>
                </div>
              )}
              {step === "password" && (
                <>
                  <div className="signup-field">
                    <label htmlFor="activation-password" className="text-label">New password</label>
                    <div className="signup-password">
                      <input id="activation-password" name="password" type={showPassword ? "text" : "password"} className="input-base" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="activation-password-hint" />
                      <button type="button" className="signup-toggle text-primary" aria-controls="activation-password activation-confirm" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
                    </div>
                    <p id="activation-password-hint" className="text-caption">Use at least 8 characters. A unique phrase with several words works well.</p>
                  </div>
                  <div className="signup-field">
                    <label htmlFor="activation-confirm" className="text-label">Confirm password</label>
                    <input id="activation-confirm" name="confirmPassword" type={showPassword ? "text" : "password"} className="input-base" autoComplete="new-password" required minLength={8} maxLength={72} />
                  </div>
                </>
              )}
            </fieldset>
            {error && <p className="signup-error text-body-sm" role="alert">{error}</p>}
            <button type="submit" className="button button-primary button-lg button-full" disabled={pending || step === "phone" && cooldown > 0}>
              {pending ? "Please wait..." : step === "phone" ? cooldown > 0 ? `Request a code in ${cooldown}s` : "Send verification code" : step === "code" ? "Verify code" : "Set password"}
            </button>
            {step === "code" && <button type="button" className="button button-md button-full" disabled={pending || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>}
            {step !== "phone" && <button type="button" className="signup-toggle text-primary" disabled={pending} onClick={restart}>Start again with a phone number</button>}
            {step === "code" && <p className="text-caption">No SMS? Check the number with your landlord. You can request up to three codes in 15 minutes. If you already set a password, sign in.</p>}
          </form>
        )}
        <p className="signup-footer text-body-sm">Already activated? <Link href="/login" className="signup-link text-primary">Sign in</Link></p>
      </div>
    </section>
  );
}
