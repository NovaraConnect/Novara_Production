import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { startAppUpdateWatcher } from "./lib/appUpdate";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD) startAppUpdateWatcher();
