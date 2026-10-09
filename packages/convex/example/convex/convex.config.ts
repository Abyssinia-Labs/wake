import { defineApp } from "convex/server";
import wake from "../../src/component/convex.config.js";

const app = defineApp();
app.use(wake);

export default app;
