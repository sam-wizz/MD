import { createRoot } from "react-dom/client";

// يجب تهيئة Supabase + setAuthTokenGetter قبل أي طلب API
import "@/lib/supabase";

import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
