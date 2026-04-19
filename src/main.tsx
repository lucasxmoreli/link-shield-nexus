import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initAnalytics } from "@/lib/analytics";

// Fire-and-forget: analytics init is fully async and never blocks the app boot.
// If the API key is missing or DNT is active, it becomes a no-op.
void initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
