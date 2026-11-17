import { supabaseStorage } from "./supabaseStorage";
import type { StorageProvider } from "./types";

export const storage: StorageProvider = supabaseStorage;
export type { StorageBucket, StorageProvider } from "./types";
