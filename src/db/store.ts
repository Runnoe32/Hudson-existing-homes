/**
 * Storage layer. Uses Upstash Redis when its REST creds are present (Vercel /
 * any host with the env vars); otherwise falls back to a local JSON file so dev
 * works with no cloud setup — the same Redis-or-file pattern the Hudson Land
 * tool uses for its CRM. Leads are stored as a single hash keyed by parcelId,
 * each value the full Lead JSON (notes embedded as `log`).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Lead } from "../lib/types";

const HASH = "hh_leads"; // namespaced so it never collides with the land tool's `crm` hash
const FILE = path.join(process.cwd(), "data", "leads.json");

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function usingRedis(): boolean {
  return getRedis() !== null;
}

async function fileReadAll(): Promise<Record<string, Lead>> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Record<string, Lead>;
  } catch {
    return {};
  }
}

async function fileWriteAll(all: Record<string, Lead>): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2));
}

/** All leads as a map keyed by parcelId. */
export async function getAllMap(): Promise<Record<string, Lead>> {
  const redis = getRedis();
  if (redis) return (await redis.hgetall<Record<string, Lead>>(HASH)) || {};
  return fileReadAll();
}

export async function getAll(): Promise<Lead[]> {
  return Object.values(await getAllMap());
}

export async function getOne(parcelId: string): Promise<Lead | null> {
  const redis = getRedis();
  if (redis) return (await redis.hget<Lead>(HASH, parcelId)) ?? null;
  const all = await fileReadAll();
  return all[parcelId] ?? null;
}

export async function putOne(lead: Lead): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.hset(HASH, { [lead.parcelId]: lead });
    return;
  }
  const all = await fileReadAll();
  all[lead.parcelId] = lead;
  await fileWriteAll(all);
}

/** Bulk write (used by sync/migration). Redis writes are chunked to stay under
 *  the REST request-size limit; the file backend writes once. */
export async function putMany(leads: Lead[]): Promise<void> {
  if (leads.length === 0) return;
  const redis = getRedis();
  if (redis) {
    const CHUNK = 100;
    for (let i = 0; i < leads.length; i += CHUNK) {
      const obj: Record<string, Lead> = {};
      for (const l of leads.slice(i, i + CHUNK)) obj[l.parcelId] = l;
      await redis.hset(HASH, obj);
    }
    return;
  }
  const all = await fileReadAll();
  for (const l of leads) all[l.parcelId] = l;
  await fileWriteAll(all);
}

export async function removeOne(parcelId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.hdel(HASH, parcelId);
    return;
  }
  const all = await fileReadAll();
  delete all[parcelId];
  await fileWriteAll(all);
}

export async function count(): Promise<number> {
  const redis = getRedis();
  if (redis) return (await redis.hlen(HASH)) ?? 0;
  return Object.keys(await fileReadAll()).length;
}
