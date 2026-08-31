import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CompanyAuthGate from "./components/CompanyAuthGate.jsx";
import { TeresitaSupabaseProvider } from "./context/TeresitaSupabaseContext.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TeresitaSupabaseProvider>
      <CompanyAuthGate>
        <App />
      </CompanyAuthGate>
    </TeresitaSupabaseProvider>
  </React.StrictMode>
);
