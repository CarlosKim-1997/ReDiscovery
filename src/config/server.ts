import "server-only";
import { parseServerConfig } from "./schema";

export const serverConfig = parseServerConfig(process.env);
