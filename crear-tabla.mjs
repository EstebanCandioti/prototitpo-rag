import { readFile } from "node:fs/promises";
import { db } from "./db.mjs";

const sql = await readFile("esquema.sql", "utf8");
await db.query(sql);
console.log("Listo: extensión vector activa, tabla fragmentos e índice HNSW creados.");
await db.end();