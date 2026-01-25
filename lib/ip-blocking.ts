/**
 * IP Blocking System
 * Handles temporary and permanent IP blocks with exponential backoff
 */

import { Redis } from "@upstash/redis";
import { createServiceClient } from "@/utils/supabase/service";
import { logSecurityEvent, logError } from "./logger";
import type { IncidentType, IncidentSeverity } from "./incident";

// --- Configuration ---

// Exponential backoff for temporary blocks (in minutes)
const BLOCK_DURATIONS: Record<number, number> = {
  1: 15,        // First offense: 15 minutes
  2: 60,        // Second offense: 1 hour (4x)
  3: 360,       // Third offense: 6 hours (6x)
  4: 1440,      // Fourth offense: 24 hours (4x)
  5: 10080,     // Fifth+ offense: 7 days
};

// Cooling period (30 days in milliseconds)
const COOLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// Incident types that trigger temporary blocks
const TEMPORARY_BLOCK_INCIDENTS: IncidentType[] = [
  "rate_limit_exceeded",
  "otp_brute_force",
  "suspicious_pattern",
  "unauthorized_access",
];

// Incident types that trigger permanent blocks
const PERMANENT_BLOCK_INCIDENTS: IncidentType[] = [
  "payment_signature_invalid",
  "webhook_signature_invalid",
];

// Critical severity always triggers permanent block
const CRITICAL_SEVERITY_PERMANENT = true;

// Redis cache TTL (1 hour for blocklist cache)
const REDIS_CACHE_TTL = 3600;

// --- Types ---

export interface BlockStatus {
  isBlocked: boolean;
  blockType?: "temporary" | "permanent";
  reason?: string;
  blockedUntil?: Date;
  offenseCount?: number;
  incidentType?: string;
}

export interface BlockResult {
  success: boolean;
  blockId?: string;
  blockType: "temporary" | "permanent";
  duration?: number; // in minutes
  error?: string;
}

export interface WhitelistEntry {
  id: string;
  ip_address: string;
  cidr_range?: string;
  label: string;
  category: string;
  notes?: string;
  added_by?: string;
  is_active: boolean;
  created_at: string;
}

export interface BlockedIpEntry {
  id: string;
  ip_address: string;
  block_type: "temporary" | "permanent";
  reason: string;
  offense_count: number;
  blocked_at: string;
  blocked_until?: string;
  incident_type?: string;
  incident_id?: string;
  blocked_by?: string;
  unblocked_at?: string;
  unblocked_by?: string;
  is_active: boolean;
}

export interface OffenseHistoryEntry {
  id: string;
  ip_address: string;
  incident_type: string;
  incident_id?: string;
  severity?: string;
  endpoint?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// --- Redis Setup ---

const hasRedisCredentials =
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedisCredentials ? Redis.fromEnv() : null;

// In-memory cache fallback
const localBlockCache = new Map<string, { status: BlockStatus; expiresAt: number }>();
const localWhitelistCache = new Map<string, { isWhitelisted: boolean; expiresAt: number }>();

// --- Helper Functions ---

/**
 * Get block duration based on offense count
 */
function getBlockDuration(offenseCount: number): number {
  const level = Math.min(offenseCount, 5);
  return BLOCK_DURATIONS[level] || BLOCK_DURATIONS[5];
}

/**
 * Calculate block expiration time
 */
function calculateBlockedUntil(offenseCount: number): Date {
  const durationMinutes = getBlockDuration(offenseCount);
  return new Date(Date.now() + durationMinutes * 60 * 1000);
}

/**
 * Determine if incident type should trigger a block
 */
function shouldBlockForIncident(incidentType: IncidentType, severity: IncidentSeverity): boolean {
  if (PERMANENT_BLOCK_INCIDENTS.includes(incidentType)) return true;
  if (CRITICAL_SEVERITY_PERMANENT && severity === "critical") return true;
  if (TEMPORARY_BLOCK_INCIDENTS.includes(incidentType)) return true;
  return false;
}

/**
 * Determine if block should be permanent
 */
function shouldBePermanent(incidentType: IncidentType, severity: IncidentSeverity): boolean {
  return (
    PERMANENT_BLOCK_INCIDENTS.includes(incidentType) ||
    (CRITICAL_SEVERITY_PERMANENT && severity === "critical")
  );
}

// --- Core Functions ---

/**
 * Check if an IP is blocked
 * Uses Redis cache with DB as source of truth
 */
export async function isIpBlocked(ip: string): Promise<BlockStatus> {
  if (!ip || ip === "unknown") {
    return { isBlocked: false };
  }

  // Check whitelist first
  if (await isIpWhitelisted(ip)) {
    return { isBlocked: false };
  }

  // Try Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<BlockStatus>(`ip:block:${ip}`);
      if (cached) {
        // Verify not expired for temporary blocks
        if (cached.blockedUntil && new Date(cached.blockedUntil) <= new Date()) {
          // Expired - remove from cache and mark inactive in DB
          await redis.del(`ip:block:${ip}`);
          await expireBlock(ip);
          return { isBlocked: false };
        }
        return {
          ...cached,
          blockedUntil: cached.blockedUntil ? new Date(cached.blockedUntil) : undefined,
        };
      }
    } catch (err) {
      logError(err as Error, { context: "ip_block_redis_check", ip });
    }
  }

  // Check in-memory cache
  const localCached = localBlockCache.get(ip);
  if (localCached && localCached.expiresAt > Date.now()) {
    return localCached.status;
  }

  // Query database
  const status = await checkBlockInDatabase(ip);

  // Cache the result
  await cacheBlockStatus(ip, status);

  return status;
}

/**
 * Check block status directly from database
 */
async function checkBlockInDatabase(ip: string): Promise<BlockStatus> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("get_active_ip_block", { check_ip: ip });

  if (error || !data || data.length === 0) {
    return { isBlocked: false };
  }

  const block = data[0];

  // Check if temporary block has expired
  if (block.block_type === "temporary" && block.blocked_until) {
    if (new Date(block.blocked_until) <= new Date()) {
      return { isBlocked: false };
    }
  }

  return {
    isBlocked: true,
    blockType: block.block_type,
    reason: block.reason,
    blockedUntil: block.blocked_until ? new Date(block.blocked_until) : undefined,
    offenseCount: block.offense_count,
    incidentType: block.incident_type,
  };
}

/**
 * Cache block status in Redis and local memory
 */
async function cacheBlockStatus(ip: string, status: BlockStatus): Promise<void> {
  // Calculate TTL
  let ttl = REDIS_CACHE_TTL;
  if (status.isBlocked && status.blockedUntil) {
    const remainingSeconds = Math.ceil((status.blockedUntil.getTime() - Date.now()) / 1000);
    ttl = Math.min(ttl, remainingSeconds);
  }
  ttl = Math.max(ttl, 60); // Minimum 60 seconds

  // Serialize for Redis
  const cacheData = {
    ...status,
    blockedUntil: status.blockedUntil?.toISOString(),
  };

  // Redis cache
  if (redis) {
    try {
      await redis.setex(`ip:block:${ip}`, ttl, cacheData);
    } catch (err) {
      logError(err as Error, { context: "ip_block_cache_set", ip });
    }
  }

  // Local cache
  localBlockCache.set(ip, {
    status,
    expiresAt: Date.now() + ttl * 1000,
  });
}

/**
 * Block an IP address
 */
export async function blockIp(params: {
  ip: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  incidentId?: string;
  reason?: string;
  blockedBy?: string; // admin user ID, null for automated
  endpoint?: string;
}): Promise<BlockResult> {
  const { ip, incidentType, severity, incidentId, reason, blockedBy, endpoint } = params;

  if (!ip || ip === "unknown") {
    return { success: false, blockType: "temporary", error: "Invalid IP address" };
  }

  // Check if this incident type should trigger a block
  if (!shouldBlockForIncident(incidentType, severity)) {
    return { success: false, blockType: "temporary", error: "Incident type does not trigger blocking" };
  }

  // Check whitelist
  if (await isIpWhitelisted(ip)) {
    logSecurityEvent("ip_block_skipped_whitelisted", { ip, incidentType });
    return { success: false, blockType: "temporary", error: "IP is whitelisted" };
  }

  const supabase = createServiceClient();

  // Determine block type
  const isPermanent = shouldBePermanent(incidentType, severity);

  try {
    if (isPermanent) {
      // Permanent block
      const { data, error } = await supabase
        .from("ip_blocklist")
        .upsert(
          {
            ip_address: ip,
            block_type: "permanent",
            reason: reason || `Permanent block: ${incidentType}`,
            incident_id: incidentId,
            incident_type: incidentType,
            blocked_by: blockedBy,
            is_active: true,
            last_offense_at: new Date().toISOString(),
          },
          {
            onConflict: "ip_address",
          }
        )
        .select("id")
        .single();

      if (error) throw error;

      // Record offense
      await recordOffense(ip, incidentType, severity, incidentId, endpoint);

      // Invalidate cache
      await invalidateBlockCache(ip);

      logSecurityEvent("ip_blocked_permanent", { ip, incidentType, blockId: data?.id });

      return {
        success: true,
        blockId: data?.id,
        blockType: "permanent",
      };
    } else {
      // Temporary block with exponential backoff
      const offenseCount = await getOffenseCount(ip);
      const newOffenseCount = offenseCount + 1;
      const blockedUntil = calculateBlockedUntil(newOffenseCount);
      const duration = getBlockDuration(newOffenseCount);

      // Check if there's an existing active block
      const { data: existing } = await supabase
        .from("ip_blocklist")
        .select("id, offense_count")
        .eq("ip_address", ip)
        .eq("is_active", true)
        .single();

      if (existing) {
        // Update existing block with new offense
        const { error } = await supabase
          .from("ip_blocklist")
          .update({
            offense_count: newOffenseCount,
            blocked_until: blockedUntil.toISOString(),
            last_offense_at: new Date().toISOString(),
            reason: reason || `Temporary block (offense #${newOffenseCount}): ${incidentType}`,
            incident_id: incidentId,
            incident_type: incidentType,
          })
          .eq("id", existing.id);

        if (error) throw error;

        await recordOffense(ip, incidentType, severity, incidentId, endpoint);
        await invalidateBlockCache(ip);

        logSecurityEvent("ip_block_extended", {
          ip,
          incidentType,
          offenseCount: newOffenseCount,
          duration,
          blockedUntil: blockedUntil.toISOString(),
        });

        return {
          success: true,
          blockId: existing.id,
          blockType: "temporary",
          duration,
        };
      } else {
        // Create new block
        const { data, error } = await supabase
          .from("ip_blocklist")
          .insert({
            ip_address: ip,
            block_type: "temporary",
            reason: reason || `Temporary block (offense #${newOffenseCount}): ${incidentType}`,
            offense_count: newOffenseCount,
            blocked_until: blockedUntil.toISOString(),
            incident_id: incidentId,
            incident_type: incidentType,
            blocked_by: blockedBy,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) throw error;

        await recordOffense(ip, incidentType, severity, incidentId, endpoint);
        await invalidateBlockCache(ip);

        logSecurityEvent("ip_blocked_temporary", {
          ip,
          incidentType,
          offenseCount: newOffenseCount,
          duration,
          blockedUntil: blockedUntil.toISOString(),
          blockId: data?.id,
        });

        return {
          success: true,
          blockId: data?.id,
          blockType: "temporary",
          duration,
        };
      }
    }
  } catch (err) {
    logError(err as Error, { context: "ip_block_failed", ip, incidentType });
    return {
      success: false,
      blockType: isPermanent ? "permanent" : "temporary",
      error: (err as Error).message,
    };
  }
}

/**
 * Unblock an IP address (admin action)
 */
export async function unblockIp(ip: string, adminId: string): Promise<boolean> {
  const supabase = createServiceClient();

  try {
    const { error } = await supabase
      .from("ip_blocklist")
      .update({
        is_active: false,
        unblocked_at: new Date().toISOString(),
        unblocked_by: adminId,
      })
      .eq("ip_address", ip)
      .eq("is_active", true);

    if (error) throw error;

    await invalidateBlockCache(ip);

    logSecurityEvent("ip_unblocked", { ip, unlockedBy: adminId });

    return true;
  } catch (err) {
    logError(err as Error, { context: "ip_unblock_failed", ip });
    return false;
  }
}

/**
 * Expire a block (called when block time has passed)
 */
async function expireBlock(ip: string): Promise<void> {
  const supabase = createServiceClient();

  await supabase
    .from("ip_blocklist")
    .update({
      is_active: false,
    })
    .eq("ip_address", ip)
    .eq("is_active", true)
    .eq("block_type", "temporary")
    .lte("blocked_until", new Date().toISOString());
}

/**
 * Get offense count considering cooling period
 */
async function getOffenseCount(ip: string): Promise<number> {
  const supabase = createServiceClient();
  const coolingThreshold = new Date(Date.now() - COOLING_PERIOD_MS);

  const { count, error } = await supabase
    .from("ip_offense_history")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", coolingThreshold.toISOString());

  if (error) {
    logError(error, { context: "get_offense_count", ip });
    return 0;
  }

  return count || 0;
}

/**
 * Record an offense in history
 */
async function recordOffense(
  ip: string,
  incidentType: IncidentType,
  severity: IncidentSeverity,
  incidentId?: string,
  endpoint?: string
): Promise<void> {
  const supabase = createServiceClient();

  await supabase.from("ip_offense_history").insert({
    ip_address: ip,
    incident_type: incidentType,
    incident_id: incidentId,
    severity,
    endpoint,
  });
}

/**
 * Invalidate block cache for an IP
 */
async function invalidateBlockCache(ip: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(`ip:block:${ip}`);
    } catch (err) {
      logError(err as Error, { context: "ip_block_cache_invalidate", ip });
    }
  }
  localBlockCache.delete(ip);
}

// --- Whitelist Functions ---

/**
 * Check if an IP is whitelisted
 */
export async function isIpWhitelisted(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") {
    return false;
  }

  // Check Redis cache
  if (redis) {
    try {
      const cached = await redis.get<boolean>(`ip:whitelist:${ip}`);
      if (cached !== null) {
        return cached;
      }
    } catch (err) {
      logError(err as Error, { context: "ip_whitelist_redis_check", ip });
    }
  }

  // Check local cache
  const localCached = localWhitelistCache.get(ip);
  if (localCached && localCached.expiresAt > Date.now()) {
    return localCached.isWhitelisted;
  }

  // Query database using the helper function
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("ip_in_whitelist", { check_ip: ip });

  const isWhitelisted = !error && data === true;

  // Cache result
  if (redis) {
    try {
      await redis.setex(`ip:whitelist:${ip}`, REDIS_CACHE_TTL, isWhitelisted);
    } catch (err) {
      logError(err as Error, { context: "ip_whitelist_cache_set", ip });
    }
  }

  localWhitelistCache.set(ip, {
    isWhitelisted,
    expiresAt: Date.now() + REDIS_CACHE_TTL * 1000,
  });

  return isWhitelisted;
}

/**
 * Add IP to whitelist
 */
export async function addToWhitelist(params: {
  ip: string;
  cidrRange?: string;
  label: string;
  category: "payment_gateway" | "webhook_provider" | "internal" | "monitoring" | "admin";
  addedBy: string;
  notes?: string;
}): Promise<boolean> {
  const supabase = createServiceClient();

  try {
    const { error } = await supabase.from("ip_whitelist").insert({
      ip_address: params.ip,
      cidr_range: params.cidrRange,
      label: params.label,
      category: params.category,
      added_by: params.addedBy,
      notes: params.notes,
      is_active: true,
    });

    if (error) throw error;

    // Invalidate cache
    await invalidateWhitelistCache(params.ip);

    // Also invalidate block cache (IP might have been blocked before whitelisting)
    await invalidateBlockCache(params.ip);

    logSecurityEvent("ip_whitelisted", {
      ip: params.ip,
      label: params.label,
      category: params.category,
      addedBy: params.addedBy,
    });

    return true;
  } catch (err) {
    logError(err as Error, { context: "whitelist_add_failed", ...params });
    return false;
  }
}

/**
 * Remove IP from whitelist
 */
export async function removeFromWhitelist(ip: string, adminId: string): Promise<boolean> {
  const supabase = createServiceClient();

  try {
    const { error } = await supabase
      .from("ip_whitelist")
      .update({ is_active: false })
      .eq("ip_address", ip)
      .eq("is_active", true);

    if (error) throw error;

    // Invalidate cache
    await invalidateWhitelistCache(ip);

    logSecurityEvent("ip_whitelist_removed", { ip, removedBy: adminId });

    return true;
  } catch (err) {
    logError(err as Error, { context: "whitelist_remove_failed", ip });
    return false;
  }
}

/**
 * Invalidate whitelist cache for an IP
 */
async function invalidateWhitelistCache(ip: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(`ip:whitelist:${ip}`);
    } catch (err) {
      logError(err as Error, { context: "ip_whitelist_cache_invalidate", ip });
    }
  }
  localWhitelistCache.delete(ip);
}

/**
 * Get all whitelisted IPs
 */
export async function getWhitelist(): Promise<WhitelistEntry[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("ip_whitelist")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    logError(error, { context: "whitelist_fetch_failed" });
    return [];
  }

  return data || [];
}

// --- Admin Functions ---

/**
 * Get blocked IPs list for admin panel
 */
export async function getBlockedIps(filters?: {
  blockType?: "temporary" | "permanent";
  isActive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ blocks: BlockedIpEntry[]; total: number }> {
  const supabase = createServiceClient();

  let query = supabase
    .from("ip_blocklist")
    .select("*", { count: "exact" })
    .order("blocked_at", { ascending: false });

  if (filters?.blockType) {
    query = query.eq("block_type", filters.blockType);
  }
  if (filters?.isActive !== undefined) {
    query = query.eq("is_active", filters.isActive);
  }

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logError(error, { context: "get_blocked_ips_failed" });
    return { blocks: [], total: 0 };
  }

  return { blocks: data || [], total: count || 0 };
}

/**
 * Get offense history for an IP
 */
export async function getIpHistory(ip: string): Promise<OffenseHistoryEntry[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("ip_offense_history")
    .select("*")
    .eq("ip_address", ip)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logError(error, { context: "get_ip_history_failed", ip });
    return [];
  }

  return data || [];
}

/**
 * Manual block by admin
 */
export async function adminBlockIp(params: {
  ip: string;
  blockType: "temporary" | "permanent";
  reason: string;
  adminId: string;
  durationMinutes?: number; // For temporary blocks
}): Promise<BlockResult> {
  const supabase = createServiceClient();

  // Check whitelist
  if (await isIpWhitelisted(params.ip)) {
    return { success: false, blockType: params.blockType, error: "IP is whitelisted" };
  }

  try {
    const blockedUntil =
      params.blockType === "temporary" && params.durationMinutes
        ? new Date(Date.now() + params.durationMinutes * 60 * 1000)
        : undefined;

    const { data, error } = await supabase
      .from("ip_blocklist")
      .insert({
        ip_address: params.ip,
        block_type: params.blockType,
        reason: params.reason,
        blocked_by: params.adminId,
        blocked_until: blockedUntil?.toISOString(),
        offense_count: 1,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw error;

    await invalidateBlockCache(params.ip);

    logSecurityEvent("ip_blocked_by_admin", {
      ip: params.ip,
      blockType: params.blockType,
      reason: params.reason,
      adminId: params.adminId,
      blockedUntil: blockedUntil?.toISOString(),
    });

    return {
      success: true,
      blockId: data?.id,
      blockType: params.blockType,
      duration: params.durationMinutes,
    };
  } catch (err) {
    logError(err as Error, { context: "admin_block_failed", ...params });
    return {
      success: false,
      blockType: params.blockType,
      error: (err as Error).message,
    };
  }
}

// --- Fast Edge-Compatible Check ---

/**
 * Fast IP block check for edge middleware/proxy
 * Uses direct Redis REST API call (no SDK) for edge compatibility
 */
export async function isIpBlockedFast(ip: string): Promise<{
  blocked: boolean;
  reason?: string;
  blockedUntil?: string;
}> {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN || !ip || ip === "unknown") {
    return { blocked: false };
  }

  try {
    // Direct Redis REST API call (edge-compatible)
    const response = await fetch(`${REDIS_URL}/get/ip:block:${ip}`, {
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
      },
    });

    if (!response.ok) {
      return { blocked: false };
    }

    const data = await response.json();

    if (!data.result) {
      return { blocked: false };
    }

    // Parse cached block status
    const blockStatus = typeof data.result === "string" ? JSON.parse(data.result) : data.result;

    if (!blockStatus.isBlocked) {
      return { blocked: false };
    }

    // Check if temporary block has expired
    if (blockStatus.blockedUntil) {
      const blockedUntil = new Date(blockStatus.blockedUntil);
      if (blockedUntil <= new Date()) {
        return { blocked: false };
      }
      return {
        blocked: true,
        reason: blockStatus.reason,
        blockedUntil: blockStatus.blockedUntil,
      };
    }

    // Permanent block
    return {
      blocked: true,
      reason: blockStatus.reason,
    };
  } catch {
    // On error, allow request through (fail open for availability)
    return { blocked: false };
  }
}
