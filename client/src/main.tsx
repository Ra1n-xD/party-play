import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GameProvider } from "./context/GameContext";
import { AdminWeddingApp } from "./wedding/AdminWeddingApp";
import { GuestWeddingApp } from "./wedding/GuestWeddingApp";
import { getPartyPlayAppKind } from "./wedding/mainRouter";
import { WeddingProvider } from "./wedding/WeddingContext";
import "./styles/global.css";
import "./styles/wedding.css";

const appKind = getPartyPlayAppKind(window.location.pathname);

function PartyPlayRoot() {
  if (appKind === "wedding-guest") {
    return (
      <WeddingProvider role="guest">
        <GuestWeddingApp />
      </WeddingProvider>
    );
  }
  if (appKind === "wedding-admin") {
    return (
      <WeddingProvider role="host">
        <AdminWeddingApp />
      </WeddingProvider>
    );
  }
  return (
    <GameProvider>
      <App />
    </GameProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PartyPlayRoot />
  </React.StrictMode>,
);
