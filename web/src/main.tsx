import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { queryClient } from "@/lib/query-client";
import { transport } from "@/lib/transport";

import { router } from "./router";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>
  </StrictMode>,
);
