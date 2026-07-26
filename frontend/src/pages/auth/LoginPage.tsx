import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi";
import { useAuth, homePathFor } from "../../contexts/AuthContext";
import { errorMessage } from "../../lib/api";
import { inputClasses } from "../../components/UI/FormField";
import logo from "../../assets/logo/logo.svg";
import sideImage from "../../assets/images/hero-1.svg";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(email, password);
      navigate(homePathFor(user));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left — barangay imagery (hidden on small screens) */}
      <div className="relative hidden w-1/2 lg:block">
        <img
          src={sideImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-primary-dark/90 via-primary/75 to-primary-light/60"
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
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/75">
              One system for certificates, requests, appointments, and barangay
              services — serving every Natumolanon with transparency, unity,
              and excellence.
            </p>
          </div>

          <p className="text-xs text-white/60">
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
            <h2 className="text-3xl font-bold text-dark">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-500">
              Sign in to your staff or resident account.
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
          </form>

          <div className="mt-8 rounded-2xl border border-gray bg-secondary/60 px-5 py-4 text-xs leading-relaxed text-gray-500 lg:bg-secondary">
            <p className="font-semibold text-dark">Resident accounts</p>
            <p className="mt-1">
              Portal accounts are issued by the Barangay Population Office after
              residency verification. Visit the BPO with a valid ID to enroll.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
