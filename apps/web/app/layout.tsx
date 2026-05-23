"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { identityApi } from "@/lib/api";
import { setAccessToken } from "@/lib/auth";
import { useAuthStore } from "@/store/auth";
import { useWebSocket, WebSocketProvider } from "@/contexts/websocket";
import { Loader2 } from "lucide-react";

import { Inter, Montserrat } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-display",
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, setAuth, clearAuth, user, updateUser } = useAuthStore();
  const { subscribe } = useWebSocket();
  const [rehydrating, setRehydrating] = useState(!accessToken);

  useEffect(() => {
    // If we already have a token in memory (navigated here from login), skip
    if (accessToken) {
      setRehydrating(false);
      return;
    }

    // Token is null — could be a page reload. Try the httpOnly cookie.
    // The refresh_token cookie is sent automatically by the browser.
    identityApi
      .post("/auth/refresh")
      .then(async (refreshRes) => {
        const newToken: string = refreshRes.data.accessToken;
        setAccessToken(newToken); // writes cookie + Zustand

        // Fetch full user data with the fresh token
        const meRes = await identityApi.get("/auth/me");
        setAuth(meRes.data.user, newToken);
      })
      .catch(() => {
        // No valid session — clear stale user from localStorage and go to login
        clearAuth();
        router.replace("/login");
      })
      .finally(() => {
        setRehydrating(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once on mount

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    // Trust score may change while the app is open (someone upvoted a post)
    // Update Zustand immediately so any component reading trustScore sees the new value
    const unsub = subscribe("trust_updated", (data) => {
      if (data.userId !== userId) return; // not for this user
      updateUser({
        trustScore: data.newScore as number,
        trustBand: data.trustBand as string,
      });
    });

    return unsub;
  }, [user?.id, subscribe, updateUser]);

  // Show spinner while we verify the session
  // Prevents flash of broken UI (e.g. community page showing "verify address" when user is verified)
  if (rehydrating) {
    return (
      <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
        <body className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="animate-spin text-gray-300" size={32} />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body>
        <WebSocketProvider>{children}</WebSocketProvider>
      </body>
    </html>
  );
}
