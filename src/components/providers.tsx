"use client";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
function Gate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const initialize = useMutation(api.workspace.initialize);
  const started = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !started.current) {
      started.current = true;
      void signIn("anonymous").catch((e) => {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
      });
    }
  }, [isLoading, isAuthenticated, signIn]);
  useEffect(() => {
    if (isAuthenticated)
      void initialize({})
        .then(() => setReady(true))
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Workspace initialization failed.",
          ),
        );
  }, [isAuthenticated, initialize]);
  if (error)
    return (
      <div className="setup-page">
        <div className="brand-mark">A</div>
        <h1>Connect your workspace</h1>
        <p>{error}</p>
        <p>
          Check that the local Convex server and authentication configuration
          are running.
        </p>
        <button
          className="button button-primary"
          onClick={() => location.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="setup-page">
        <div className="brand-mark">A</div>
        <h1>Opening Finance Operations</h1>
        <p>Connecting your private simulation workspace…</p>
        <div className="loading-line" />
      </div>
    );
  return children;
}
export function Providers({ children }: { children: ReactNode }) {
  if (!client)
    return (
      <div className="setup-page">
        <div className="brand-mark">A</div>
        <h1>Attest is ready to connect</h1>
        <p>Set NEXT_PUBLIC_CONVEX_URL in .env.local, then restart the app.</p>
        <code>npm run convex</code>
        <p>Every number has a reason.</p>
      </div>
    );
  return (
    <ConvexAuthProvider client={client}>
      <Gate>{children}</Gate>
    </ConvexAuthProvider>
  );
}
