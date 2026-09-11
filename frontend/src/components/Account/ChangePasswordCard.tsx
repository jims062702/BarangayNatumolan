import { useState, type FormEvent } from "react";
import { FiCheck, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import Card from "../UI/Card";
import { inputClasses } from "../UI/FormField";

/**
 * Changing your own password, from inside the account.
 *
 * Two proofs, not one. The current password says you are the person who was
 * given this account; the code says you still hold the mailbox it belongs to.
 * Either one alone has a way to fail badly — a borrowed unlocked phone has
 * the mailbox on it, and somebody who watched you type your password at the
 * counter has the password.
 *
 * Three steps rather than one long form, for the same reason the forgotten-
 * password screen is three: somebody who mistypes the code should find that
 * out before they have chosen a new password, not after.
 */

type Stage = "closed" | "ask" | "code" | "set";

const STEPS = ["ask", "code", "set"] as const;
const STEP_LABELS = ["Get a code", "Enter it", "New password"];

export default function ChangePasswordCard() {
  const [stage, setStage] = useState<Stage>("closed");
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setStage("closed");
    setCurrent("");
    setCode("");
    setNext("");
    setConfirm("");
    setShow(false);
    setError("");
  };

  /* Step one: ask for the code. The address is the one on the account —
     this form never offers to send it somewhere else. */
  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await api.post("/auth/password-change/code");

      setSentTo(response.data.data.email);
      setStage("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /*
   * Step two is held here rather than checked on the server.
   *
   * There is no verify endpoint for this flow, and adding one would mean the
   * code could be tried without the current password — which is the pairing
   * this card exists to enforce. So this step only carries the six digits
   * forward; the server checks them when the password is actually set, and a
   * wrong one sends the form back to this step with the message.
   */
  const holdCode = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStage("set");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (next !== confirm) {
      setError("The two new passwords do not match.");

      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await api.post("/auth/password-change", {
        current_password: current,
        code,
        new_password: next,
        new_password_confirmation: confirm,
      });

      /*
       * The server revoked every token, including the one this tab is using,
       * and handed back a fresh one. Storing it is what keeps the resident
       * signed in here while every other device is signed out.
       */
      localStorage.setItem("authToken", response.data.data.token);

      toast(response.data.message);
      reset();
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      /* A bad code belongs to the code step, so send them back to it rather
         than leaving them staring at a password field. */
      if (/code/i.test(message)) setStage("code");
    } finally {
      setBusy(false);
    }
  };

  const eye = (
    <button
      type="button"
      onClick={() => setShow(!show)}
      aria-label={show ? "Hide password" : "Show password"}
      title={show ? "Hide password" : "Show password"}
      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 transition-colors hover:text-primary"
    >
      {show ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
    </button>
  );

  return (
    <Card title="Password">
      {stage === "closed" ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-lg text-sm leading-relaxed text-gray-500">
            Change the password you use to sign in. You will need your current password and a
            6-digit code we email you.
          </p>
          <button
            type="button"
            onClick={() => setStage("ask")}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiLock className="h-4 w-4" aria-hidden="true" /> Change my password
          </button>
        </div>
      ) : (
        <div className="max-w-lg">
          {/* Three steps, numbered, so the length of the thing is visible from
              the first screen rather than a surprise at the second. */}
          <ol className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {STEPS.map((step, index) => {
              const done = STEPS.indexOf(stage as (typeof STEPS)[number]) > index;
              const here = stage === step;

              return (
                <li
                  key={step}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                    here
                      ? "bg-primary text-white"
                      : done
                        ? "bg-success/10 text-success"
                        : "bg-secondary text-gray-400"
                  }`}
                >
                  {done ? <FiCheck className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                  {STEP_LABELS[index]}
                </li>
              );
            })}
          </ol>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          )}

          {stage === "ask" && (
            <form onSubmit={sendCode} className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-500">
                We will email a 6-digit code to the address on your account. It is good for 15
                minutes.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                >
                  <FiMail className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Sending…" : "Email me a code"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {stage === "code" && (
            <form onSubmit={holdCode} className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-500">
                Enter the code sent to <strong className="text-dark">{sentTo}</strong>.
              </p>

              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                className={`${inputClasses} text-center font-mono text-2xl tracking-[0.5em]`}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={code.length !== 6}
                  className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy}
                  className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  Send another
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer rounded-full px-3 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:text-danger"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {stage === "set" && (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">
                  Your current password
                </span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                    required
                    className={`${inputClasses} pr-12`}
                  />
                  {eye}
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">New password</span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className={`${inputClasses} pr-12`}
                  />
                  {eye}
                </div>
                <span className="mt-1 block text-xs text-gray-500">At least 8 characters.</span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">
                  Type the new password again
                </span>
                <input
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={inputClasses}
                />
              </label>

              {/* Said before it happens, not after. Somebody signed in on a
                  shared phone at home should know that phone is about to be
                  signed out. */}
              <p className="rounded-xl bg-secondary px-4 py-3 text-xs leading-relaxed text-gray-500">
                Every other device signed in to this account will be signed out. This one stays
                signed in.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="cursor-pointer rounded-full bg-success px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Changing…" : "Change my password"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer rounded-full border border-gray px-5 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
