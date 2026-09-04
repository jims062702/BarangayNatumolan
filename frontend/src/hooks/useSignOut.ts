import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { confirmAction } from "../lib/confirm";
import { toast } from "../lib/toast";

/**
 * Signing out — asked before, confirmed after.
 *
 * The button sits in the navbar and in the sidebar rail, a few pixels from
 * things people press all day, and a mis-click used to end the session
 * outright. Nothing is lost that cannot be got back, but getting it back means
 * finding the password again, and a clerk halfway through a registration
 * form loses the form with it.
 *
 * The toast afterwards is the other half: without it, a sign-out and a
 * session that quietly expired look identical, and "did that work?" is not a
 * question a person should have to ask about a button they just pressed.
 *
 * Both places sign out the same way and land somewhere different — staff back
 * at the login form, a resident on the public site rather than dropped onto
 * one — so the wording lives here and only the destination is passed in.
 */
export function useSignOut(destination: string) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return async (): Promise<boolean> => {
    const confirmed = await confirmAction({
      title: "Sign out?",
      text: "You will need to sign in again to reach your account. Anything you have typed but not saved will be lost.",
      confirmText: "Yes, sign out",
      cancelText: "Stay signed in",
    });

    if (!confirmed) return false;

    await logout();
    toast("You have been signed out.");
    navigate(destination);

    return true;
  };
}
