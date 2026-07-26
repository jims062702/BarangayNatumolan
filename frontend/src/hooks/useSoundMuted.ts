import { useEffect, useState } from "react";
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from "../lib/sound";

/**
 * Reads/writes the shared notification-sound mute preference and stays in sync
 * across every component using it (bell + chatbot share one toggle).
 */
export function useSoundMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(isSoundMuted());

  useEffect(() => subscribeSoundMuted(setMuted), []);

  const toggle = () => setSoundMuted(!isSoundMuted());

  return [muted, toggle];
}
