import "./styles.css";
import { Game } from "./game";

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
new Game(root).start();
