import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiEye, FiEyeOff, FiMail } from "react-icons/fi";
import { useAuth, homePathFor } from "../../contexts/AuthContext";
import { api, errorMessage } from "../../lib/api";
import { inputClasses } from "../../components/UI/FormField";
import logo from "../../assets/logo/logo.svg";
/*
 * Bundled rather than pulled from /storage.
 *
 * This is the page somebody opens when the rest of the system is not
 * working. A background served by the API disappears exactly when the API
 * does — and the same photo lives in the hero slides, where an SK admin can
 * delete it without ever knowing the sign-in page was leaning on it.
 */
import sideImage from "../../assets/images/barangay-officials.jpg";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  /*
   * Set once the password has been accepted but the account has never been
   * activated. The password is kept in state because the activation call
   * re-presents it — a code on its own must never be enough to get in.
   */
  const [activation, setActivation] = useState<{ email: string } | null>(null);
  const [code, setCode] = useState("");

  /*
   * The forgotten-password detour.
   *
   * "ask" collects the address, "code" collects what was emailed plus the new
   * password. Null is the ordinary sign-in form.
   */
  const [forgot, setForgot] = useState<"ask" | "code" | "set" | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const { login, activate } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.kind === "needs-activation") {
        setActivation({ email: result.email });
        setCode("");
        setNotice(
          result.otpSent
            ? result.message
            : "We could not send the email just now. Press “Send another code” in a moment, or ask the Barangay Population Office for help."
        );
        return;
      }

      navigate(homePathFor(result.user));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const user = await activate(email, password, code.trim());
      navigate(homePathFor(user));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const response = await api.post("/auth/resend-activation", { email, password });
      setNotice(response.data.message);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const cancelActivation = () => {
    setActivation(null);
    setCode("");
    setError("");
    setNotice("");
  };

  /**
   * Ask for a code.
   *
   * The reply is the same whether or not the address is on file — the server
   * makes sure of that — so this cannot be used to find out who has an
   * account, and the message here must not undo it by saying more.
   */
  const askForCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await api.post("/auth/forgot-password", { email });
      setNotice(response.data.message);
      setForgot("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * The code alone, before any password is chosen.
   *
   * The row is not consumed by this — the code is checked again when the
   * password is actually set, so getting past this screen is not on its own
   * permission to change anything.
   */
  const checkCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post("/auth/verify-reset-code", { email, code: resetCode.trim() });
      setNotice("");
      setForgot("set");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const useCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post("/auth/reset-password", {
        email,
        code: resetCode.trim(),
        password: newPassword,
        password_confirmation: newPasswordAgain,
      });

      /* Straight back to signing in, with the address already filled and the
         new password to type — which is the thing that proves it worked. */
      setForgot(null);
      setResetCode("");
      setNewPassword("");
      setNewPasswordAgain("");
      setPassword("");
      setNotice("Your password has been changed. Sign in with it now.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const leaveForgot = () => {
    setForgot(null);
    /* A password left visible on the way out would still be visible on the
       sign-in form, which is a different screen and possibly a different
       person at the counter. */
    setShowPassword(false);
    setError("");
    setNotice("");
    setResetCode("");
    setNewPassword("");
    setNewPasswordAgain("");
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left — barangay imagery (hidden on small screens) */}
      {/*
        overflow-hidden, because the backdrop is scaled up and blurred.

        A 40px blur spreads well past the edge of the element it is on,
        and scale-110 pushes it further still — so without this the
        colour smeared out over the white half of the page. Nothing
        clipped it: the panel is only `relative`.
      */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        {/*
          Two copies of the one photo, and only one of them is meant to be
          looked at.

          The panel is half a wide screen — nearly square — and the photo is
          landscape, so `object-cover` filled the box by cutting 14 to 20 per
          cent off each SIDE. What it cut was the councillors standing at
          either end: the barangay's own officials, absent from the barangay's
          own sign-in page.

          So the sharp copy is CONTAINED, whole, everybody in it. A blurred,
          over-scaled copy fills the space that leaves, which under a
          seventy-per-cent colour wash reads as texture rather than as a
          letterbox. The file is fetched once and drawn twice.
        */}
        <img
          src={sideImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
        />
        <img
          src={sideImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-contain"
        />
        {/*
          Two layers, because they do two jobs.

          The brand wash is the look — the same purple-into-magenta the landing
          page puts over this photo. The scrim underneath the text is legibility:
          the wash alone thins out towards the bottom right, and the heading sits
          over faces and a bright pink shirt rather than over flat colour.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-primary-dark/90 via-primary/80 to-fuchsia-600/70"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-primary-dark/70 via-primary-dark/20 to-transparent"
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-white/85 transition-colors hover:text-white"
          >
            <FiArrowLeft aria-hidden="true" /> Back to website
          </Link>

          <div>
            <img src={logo} alt="" aria-hidden="true" className="h-20 w-20" />
            <h1 className="mt-6 max-w-md text-4xl font-extrabold leading-tight text-white">
              Barangay Natumolan
            </h1>
            <p className="mt-3 max-w-md text-lg font-light text-white/90">
              Management Information System
            </p>
            {/* white/90, not /75: measured at 4.3:1 over the photo, which is under
                AA. The flat illustration this replaced was darker here. */}
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/90">
              One system for certificates, requests, appointments, and barangay
              services — serving every Natumolanon with transparency, unity,
              and excellence.
            </p>
          </div>

          <p className="text-xs text-white/80">
            Tagoloan · Misamis Oriental · Philippines
          </p>
        </div>
      </div>

      {/* Right — sign-in form */}
      <div className="flex w-full items-center justify-center bg-secondary px-4 py-10 lg:w-1/2 lg:bg-white">
        <div className="w-full max-w-md">
          {/* Mobile-only back link + branding (the image panel is hidden) */}
          <div className="mb-8 lg:hidden">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-primary"
            >
              <FiArrowLeft aria-hidden="true" /> Back to website
            </Link>
            <div className="text-center">
              <img src={logo} alt="Barangay Natumolan logo" className="mx-auto h-16 w-16" />
              <h1 className="mt-3 text-2xl font-bold text-dark">Barangay Natumolan</h1>
              <p className="mt-1 text-sm text-gray-500">Management Information System</p>
            </div>
          </div>

          <div className="hidden lg:block">
            <h2 className="text-3xl font-bold text-dark">
              {activation ? "Verify your email" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {activation
                ? "One last step before your account is yours."
                : "Sign in to your staff or resident account."}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-dark"
            >
              {notice}
            </div>
          )}

          {activation ? (
            /*
             * Activation. The account already exists — it was created when the
             * Population Office registered this resident — so this is not a
             * sign-up: it is proving the mailbox on their record is theirs.
             */
            <form onSubmit={submitCode} className="mt-6 space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-gray bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-gray-600">
                <FiMail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  We emailed a 6-digit code to{" "}
                  <strong className="text-dark">{activation.email}</strong>. Enter it below to
                  activate your portal account.
                </span>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">Verification code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${inputClasses} text-center font-mono text-2xl tracking-[0.5em]`}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full cursor-pointer rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Activate my account"}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={resend}
                  disabled={loading}
                  className="cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60"
                >
                  Send another code
                </button>
                <button
                  type="button"
                  onClick={cancelActivation}
                  className="cursor-pointer font-medium text-gray-500 hover:text-dark"
                >
                  Use a different account
                </button>
              </div>
            </form>
          ) : forgot === "ask" ? (
            <form onSubmit={askForCode} className="mt-6 space-y-5">
              <p className="text-sm leading-relaxed text-gray-500">
                Type the email on your account and we will send a 6-digit code
                to it. If you cannot reach that inbox, the Barangay Population
                Office can set a password for you at the counter.
              </p>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClasses}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send me a code"}
              </button>

              <button
                type="button"
                onClick={leaveForgot}
                className="w-full cursor-pointer text-xs font-medium text-gray-500 hover:text-dark"
              >
                Back to sign in
              </button>
            </form>
          ) : forgot === "code" ? (
            /* Step two: the code, and nothing else. */
            <form onSubmit={checkCode} className="mt-6 space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-gray bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-gray-600">
                <FiMail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  We emailed a 6-digit code to <strong className="text-dark">{email}</strong>.
                  Enter it to continue.
                </span>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">
                  Verification code
                </span>
                <input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${inputClasses} text-center font-mono text-2xl tracking-[0.5em]`}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || resetCode.length < 6}
                className="w-full cursor-pointer rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Checking…" : "Continue"}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setForgot("ask")}
                  className="cursor-pointer font-semibold text-primary hover:underline"
                >
                  Send another code
                </button>
                <button
                  type="button"
                  onClick={leaveForgot}
                  className="cursor-pointer font-medium text-gray-500 hover:text-dark"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : forgot === "set" ? (
            /* Step three, reached only with a code that checked out. */
            <form onSubmit={useCode} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">New password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${inputClasses} pr-12`}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    autoFocus
                    required
                  />
                  {/*
                    One switch for both boxes.

                    Somebody choosing a password they have never typed before
                    needs to see it, and two separate eyes on two boxes that
                    must match is one control too many.
                  */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">
                  New password again
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPasswordAgain}
                    onChange={(e) => setNewPasswordAgain(e.target.value)}
                    className={`${inputClasses} pr-12`}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
                  </button>
                </div>
                {/* Said as they type, not after they submit. */}
                {newPasswordAgain !== "" && newPassword !== newPasswordAgain && (
                  <span className="mt-1.5 block text-xs font-medium text-danger">
                    The two passwords do not match.
                  </span>
                )}
              </label>

              <button
                type="submit"
                disabled={
                  loading || newPassword.length < 8 || newPassword !== newPasswordAgain
                }
                className="w-full cursor-pointer rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving…" : "Set my new password"}
              </button>

              <button
                type="button"
                onClick={() => setForgot("code")}
                className="w-full cursor-pointer text-xs font-medium text-gray-500 hover:text-dark"
              >
                Back to the code
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClasses}
                  placeholder="you@natumolan.local"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-dark">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClasses} pr-12`}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              {/*
                Under the button, where somebody looks after it has not worked.
                A quiet link rather than a second button: it is the way out of
                a problem, not a second thing to choose between.
              */}
              <button
                type="button"
                onClick={() => {
                  setForgot("ask");
                  setError("");
                  setNotice("");
                }}
                className="w-full cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                Forgot your password?
              </button>
            </form>
          )}

          {!activation && (
            <div className="mt-8 rounded-2xl border border-gray bg-secondary/60 px-5 py-4 text-xs leading-relaxed text-gray-500 lg:bg-secondary">
              <p className="font-semibold text-dark">Resident accounts</p>
              <p className="mt-1">
                Your account is created for you when the Barangay Population Office registers you —
                you do not need to sign up. Sign in with the email on your record; your password is
                your <strong>last name followed by the month and year you were
                born</strong> — for example <span className="font-mono">Gasang062002</span> for
                somebody named Gasang born in June 2002. The first time you sign in we
                will email you a 6-digit code to confirm the account is yours.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
