import { buildApp } from "./app";
import { openDb } from "./db";

const port = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? "stayscout.db");
const app = buildApp(db);

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`StayScout API on http://localhost:${port}`);
});
