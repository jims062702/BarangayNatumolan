import { useCallback, useRef, useState } from "react";
import type { AxiosProgressEvent } from "axios";

/**
 * How far a file has got, so the person who picked it can tell.
 *
 * A file input that says nothing between "Choose File" and the page moving on
 * gives somebody uploading a 4MB photo on barangay wi-fi no way to tell a
 * slow upload from a broken one — so they press the button again, and the
 * office gets the photo twice.
 *
 * `done` is deliberately separate from `progress === 100`. The bytes reach the
 * server before the server has finished with them: a photo is still being
 * resized and written at 100%, and calling that finished is how a page says
 * "saved" a moment before it actually is.
 */
export function useUpload() {
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const doneTimer = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    window.clearTimeout(doneTimer.current);
    setProgress(null);
    setDone(false);
  }, []);

  /** Spread into the axios call: `api.post(url, body, { ...tracker })`. */
  const tracker = {
    onUploadProgress: (event: AxiosProgressEvent) => {
      /*
       * No total means a stream of unknown length. Reporting a percentage of
       * an unknown is a made-up number, so the field shows an indeterminate
       * bar instead — which is honest about not knowing.
       */
      if (!event.total) {
        setProgress(-1);

        return;
      }

      setProgress(Math.round((event.loaded / event.total) * 100));
    },
  };

  /** Call when the request RESOLVES — not when the bar reaches the end. */
  const finish = useCallback(() => {
    setProgress(100);
    setDone(true);

    /* The tick stays up long enough to be read, then clears itself so a
       second upload does not start out looking already finished. */
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => {
      setProgress(null);
      setDone(false);
    }, 4000);
  }, []);

  const fail = useCallback(() => {
    window.clearTimeout(doneTimer.current);
    setProgress(null);
    setDone(false);
  }, []);

  return { progress, done, uploading: progress !== null && !done, tracker, finish, fail, reset };
}
