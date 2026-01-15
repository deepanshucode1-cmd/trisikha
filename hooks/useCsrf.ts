"use client";

import { useEffect, useState, useCallback } from "react";

const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "csrf_token";

/**
 * Get CSRF token from cookie
 */
function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Hook to manage CSRF token
 * Fetches a new token on mount and provides it for use in requests
 */
export function useCsrf() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First check if we have a valid token in cookie
      const existingToken = getCsrfTokenFromCookie();
      if (existingToken) {
        setToken(existingToken);
        setLoading(false);
        return;
      }

      // Fetch new token
      const response = await fetch("/api/csrf");
      if (!response.ok) {
        throw new Error("Failed to fetch CSRF token");
      }

      const data = await response.json();
      setToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  /**
   * Get headers with CSRF token included
   */
  const getCsrfHeaders = useCallback((): Record<string, string> => {
    const currentToken = token || getCsrfTokenFromCookie();
    if (!currentToken) {
      return {};
    }
    return {
      [CSRF_HEADER_NAME]: currentToken,
    };
  }, [token]);

  /**
   * Wrapper for fetch that includes CSRF token
   */
  const csrfFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const currentToken = token || getCsrfTokenFromCookie();

      const headers = new Headers(options.headers);
      if (currentToken) {
        headers.set(CSRF_HEADER_NAME, currentToken);
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [token]
  );

  return {
    token,
    loading,
    error,
    refreshToken: fetchToken,
    getCsrfHeaders,
    csrfFetch,
  };
}

export default useCsrf;
