import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Wraps every <Link> navigation in document.startViewTransition so the
    // page slot fades between routes. Sidebar + SettingsButton are pulled
    // out of the transition via viewTransitionName so they don't flicker.
    viewTransition: true,
  },
};

export default nextConfig;
