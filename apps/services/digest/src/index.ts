import * as dotenv from "dotenv";
dotenv.config();

import { startDigest } from "./start";

startDigest().catch((err) => {
  console.error("[Digest] Fatal:", err);
  process.exit(1);
});
