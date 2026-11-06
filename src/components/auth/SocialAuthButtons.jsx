import React from "react";
import { Button } from "@/components/ui/button";
import { supabase, appUrl } from "@/lib/supabase";
import { toast } from "sonner";
import GoogleIcon from "@/components/GoogleIcon";

const MicrosoftIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
    <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
    <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
    <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
  </svg>
);

const FacebookIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="#1877F2" aria-hidden="true">
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.43c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.88v2.26h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z" />
  </svg>
);

const AppleIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M17.05 12.04c-.03-2.57 2.1-3.8 2.2-3.87-1.2-1.75-3.06-1.99-3.72-2.01-1.58-.16-3.08.93-3.88.93-.8 0-2.03-.9-3.34-.88-1.72.03-3.32.99-4.2 2.51-1.8 3.1-.46 7.69 1.27 10.2.84 1.23 1.85 2.6 3.16 2.55 1.27-.05 1.75-.82 3.29-.82 1.53 0 1.97.82 3.32.79 1.37-.03 2.24-1.25 3.07-2.49.97-1.42 1.37-2.8 1.39-2.87-.03-.01-2.66-1.02-2.68-4.04zM14.75 4.9c.7-.85 1.18-2.02 1.05-3.2-1.01.04-2.24.67-2.97 1.52-.65.75-1.22 1.96-1.07 3.11 1.13.09 2.29-.58 2.99-1.43z" />
  </svg>
);

// `provider` is the Supabase provider id (Microsoft is "azure" in Supabase).
const PROVIDERS = [
  { key: "google", provider: "google", label: "Google", Icon: GoogleIcon },
  { key: "microsoft", provider: "azure", label: "Microsoft", Icon: MicrosoftIcon },
  { key: "facebook", provider: "facebook", label: "Facebook", Icon: FacebookIcon },
  { key: "apple", provider: "apple", label: "Apple", Icon: AppleIcon },
];

// D5: only providers configured in Supabase are shown (VITE_AUTH_PROVIDERS, default google).
const enabled = new Set(
  (import.meta.env.VITE_AUTH_PROVIDERS ?? "google").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);

export default function SocialAuthButtons({ returnTo }) {
  const providers = PROVIDERS.filter((p) => enabled.has(p.key));
  if (providers.length === 0) return null;

  const signIn = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${appUrl()}${returnTo || "/"}` } });
    if (error) toast.error(error.message || "Sign-in failed");
  };

  return (
    <div className="space-y-2.5 mb-6">
      {providers.map(({ key, provider, label, Icon }) => (
        <Button
          key={key}
          variant="outline"
          className="w-full h-12 text-sm font-medium"
          onClick={() => signIn(provider)}
        >
          <Icon className="w-5 h-5 mr-2" />
          Continue with {label}
        </Button>
      ))}
    </div>
  );
}