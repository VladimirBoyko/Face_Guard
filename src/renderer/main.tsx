import { createRoot } from "react-dom/client";
import { FaceGuardApp } from "../../app/FaceGuardApp";
import "../../app/globals.css";

document.body.classList.add("desktop-mode");

const root = document.getElementById("root");
if (!root) throw new Error("FaceGuard renderer root is unavailable.");
createRoot(root).render(<FaceGuardApp />);
