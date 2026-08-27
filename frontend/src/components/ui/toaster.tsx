"use client";

import { Toaster } from "react-hot-toast";

/** App-wide toast host, themed with the existing card/border tokens. */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        className:
          "!rounded-lg !border !border-border !bg-card !text-card-foreground !shadow-sm !text-sm",
        success: {
          iconTheme: {
            primary: "var(--primary)",
            secondary: "var(--primary-foreground)",
          },
        },
        error: {
          iconTheme: {
            primary: "var(--destructive)",
            secondary: "var(--primary-foreground)",
          },
        },
        duration: 3500,
      }}
    />
  );
}
