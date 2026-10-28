/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useReducer } from "@webpack/common";

import type { CollectibleRef, CollectibleSlot, ExportFile, Preset, StoredImage } from "./types";
import { clone, logger, MAX_NAME_LENGTH } from "./utils";

const PRESETS_KEY = "ProfilePresets_presets";
const ITEMS_KEY = "ProfilePresets_items";
/** Keys used by older versions of the plugin, read once to migrate. */
const LEGACY_PRESETS_KEY = "ProfilePresets_v2";
const LEGACY_ITEMS_KEY = "ProfilePresets_itemCache";

export const SLOTS: readonly CollectibleSlot[] = ["avatarDecoration", "nameplate", "profileEffect", "profileFrame"];

let presets: Preset[] = [];
const items: Record<string, Record<string, unknown>> = {};
let activePresetId: string | null = null;
let ready: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

export function initStorage() {
    return ready ??= load();
}

async function load() {
    try {
        const stored = await DataStore.get<unknown[]>(PRESETS_KEY);
        if (Array.isArray(stored)) {
            presets = stored.map(p => sanitizePreset(p, true)).filter(p => p != null);
        } else {
            const legacy = await DataStore.get<unknown[]>(LEGACY_PRESETS_KEY);
            if (Array.isArray(legacy) && legacy.length > 0) {
                presets = legacy.map(fromLegacy).filter(p => p != null);
                await DataStore.set(PRESETS_KEY, presets);
                logger.info(`Migrated ${presets.length} preset(s) from an older version`);
            }
        }

        const [storedItems, legacyItems] = await Promise.all([
            DataStore.get<Record<string, unknown>>(ITEMS_KEY),
            DataStore.get<Record<string, unknown>>(LEGACY_ITEMS_KEY)
        ]);
        for (const source of [legacyItems, storedItems]) {
            if (!source || typeof source !== "object") continue;
            for (const value of Object.values(source)) {
                const item = sanitizeItemData(value);
                if (item) items[String(item.skuId)] = item;
            }
        }
    } catch (err) {
        logger.error("Couldn't load presets", err);
    }
    emit();
}

async function persist() {
    await DataStore.set(PRESETS_KEY, presets);
    emit();
}

// #region Presets

export function getPresets(): readonly Preset[] {
    return presets;
}

export function getPreset(id: string) {
    return presets.find(p => p.id === id);
}

export function usePresets() {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => subscribe(rerender), []);
    return presets;
}

export function useActivePresetId() {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => subscribe(rerender), []);
    return activePresetId;
}

export function setActivePreset(id: string | null) {
    activePresetId = id;
    emit();
}

/** Returns an error message, or null when the name is usable. */
export function validateName(name: string, ignoreId?: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "Give it a name";
    if (trimmed.length > MAX_NAME_LENGTH) return `Keep it under ${MAX_NAME_LENGTH} characters`;
    const taken = presets.some(p => p.id !== ignoreId && p.name.toLowerCase() === trimmed.toLowerCase());
    return taken ? "You already have a preset with that name" : null;
}

export async function addPreset(preset: Preset) {
    presets = [preset, ...presets];
    await persist();
}

export async function replacePreset(id: string, next: Preset) {
    presets = presets.map(p => p.id === id ? { ...next, id, name: p.name, createdAt: p.createdAt } : p);
    await persist();
}

export async function renamePreset(id: string, name: string) {
    presets = presets.map(p => p.id === id ? { ...p, name: name.trim(), updatedAt: Date.now() } : p);
    await persist();
}

export async function deletePreset(id: string) {
    presets = presets.filter(p => p.id !== id);
    if (activePresetId === id) activePresetId = null;
    await persist();
}

// #endregion

// #region Import / export

export function buildExport(list: readonly Preset[]): string {
    const file: ExportFile = { format: "vc-profile-presets", version: 1, presets: clone([...list]) };
    return JSON.stringify(file);
}

/** Imports presets from an export file. Returns how many were added. */
export async function importPresets(json: string): Promise<number> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error("That file isn't valid JSON");
    }

    const list = Array.isArray(parsed) ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as ExportFile).presets) ? (parsed as ExportFile).presets
            : null;
    if (!list) throw new Error("That file doesn't contain presets");

    const added: Preset[] = [];
    for (const raw of list) {
        const preset = sanitizePreset(raw, false) ?? fromLegacy(raw);
        if (!preset) continue;
        preset.name = uniqueName(preset.name, added);
        added.push(preset);
    }
    if (added.length === 0) throw new Error("No valid presets in that file");

    presets = [...added, ...presets];
    await persist();
    return added.length;
}

function uniqueName(name: string, pending: Preset[]) {
    const taken = (n: string) => [...presets, ...pending].some(p => p.name.toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    for (let i = 2; ; i++) {
        const suffix = ` (${i})`;
        const candidate = name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
        if (!taken(candidate)) return candidate;
    }
}

// #endregion

// #region Collectible cache
// Discord only hands out the full data of a decoration, effect or nameplate (assets,
// animation frames…) when you equip it in the profile editor. Every item you equip is
// remembered here so presets can put it back later.

export function getCachedItem(skuId: string) {
    return items[skuId];
}

export function rememberItems(values: unknown[]) {
    let changed = false;
    for (const value of values) {
        const item = sanitizeItemData(value);
        if (!item) continue;
        items[String(item.skuId)] = item;
        changed = true;
    }
    if (changed) DataStore.set(ITEMS_KEY, items).catch(err => logger.warn("Couldn't save item cache", err));
}

// #endregion

// #region Validation
// Presets can come from files other people send you, so everything is checked
// before it's stored or handed to Discord.

const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_IMAGE_LENGTH = 16 * 1024 * 1024;
const SKU_ID = /^\d{1,25}$/;
const ASSET_HASH = /^[\w.-]{1,128}$/;
const DISCORD_URL = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//;
const LOOKS_LIKE_URL = /^\s*([a-z][a-z\d+.-]*:\/\/|\/\/|(javascript|data|blob|file|vbscript):)/i;

function sanitizeImage(value: unknown): StoredImage | undefined {
    if (!value || typeof value !== "object") return;
    const { hash, dataUri } = value as Record<string, unknown>;
    if (typeof dataUri !== "string" || dataUri.length > MAX_IMAGE_LENGTH || !DATA_IMAGE.test(dataUri)) return;
    return { hash: typeof hash === "string" && ASSET_HASH.test(hash) ? hash : null, dataUri };
}

/** Plain JSON only, and any URL inside has to point at Discord's CDN. */
function isSafeJson(value: unknown, depth = 0): boolean {
    if (depth > 8) return false;
    if (value === null || typeof value === "number" || typeof value === "boolean") return true;
    if (typeof value === "string") {
        if (value.length > 4096) return false;
        return !LOOKS_LIKE_URL.test(value) || DISCORD_URL.test(value);
    }
    if (Array.isArray(value)) return value.length <= 200 && value.every(v => isSafeJson(v, depth + 1));
    if (typeof value === "object") {
        const entries = Object.entries(value as object);
        return entries.length <= 100 && entries.every(([, v]) => isSafeJson(v, depth + 1));
    }
    return false;
}

function sanitizeItemData(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const { skuId } = value as Record<string, unknown>;
    if (typeof skuId !== "string" || !SKU_ID.test(skuId) || !isSafeJson(value)) return;
    return clone(value as Record<string, unknown>);
}

function sanitizeRef(value: unknown): CollectibleRef | null | undefined {
    if (value === null) return null;
    if (!value || typeof value !== "object") return;
    const { skuId, data } = value as Record<string, unknown>;
    if (typeof skuId !== "string" || !SKU_ID.test(skuId)) return;
    const safeData = sanitizeItemData(data);
    return safeData && safeData.skuId === skuId ? { skuId, data: safeData } : { skuId };
}

function sanitizePreset(raw: unknown, keepId: boolean): Preset | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== "string" || !r.name.trim() || !r.collectibles || typeof r.collectibles !== "object") return null;

    const now = Date.now();
    const preset: Preset = {
        id: keepId && typeof r.id === "string" ? r.id : crypto.randomUUID(),
        name: r.name.trim().slice(0, MAX_NAME_LENGTH),
        createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
        collectibles: {}
    };

    const avatar = sanitizeImage(r.avatar);
    if (avatar) preset.avatar = avatar;
    const banner = sanitizeImage(r.banner);
    if (banner) preset.banner = banner;
    if (typeof r.bio === "string") preset.bio = r.bio.slice(0, 1000);
    if (r.themeColors === null) preset.themeColors = null;
    else if (Array.isArray(r.themeColors) && r.themeColors.length === 2 && r.themeColors.every(Number.isInteger)) {
        preset.themeColors = [r.themeColors[0], r.themeColors[1]];
    }

    const collectibles = r.collectibles as Record<string, unknown>;
    for (const slot of SLOTS) {
        if (!(slot in collectibles)) continue;
        const ref = sanitizeRef(collectibles[slot]);
        if (ref !== undefined) preset.collectibles[slot] = ref;
    }

    if (Array.isArray(r.widgets) && r.widgets.length <= 50 && isSafeJson(r.widgets)) {
        preset.widgets = clone(r.widgets);
    }

    return preset;
}

/** Converts presets saved by older versions of the plugin. */
function fromLegacy(raw: unknown): Preset | null {
    if (!raw || typeof raw !== "object") return null;
    const old = raw as Record<string, any>;
    if (typeof old.name !== "string" || !old.name.trim()) return null;

    const image = (uri: unknown, hash: unknown) => typeof uri === "string" ? { hash, dataUri: uri } : undefined;
    const pendingKeys: Record<CollectibleSlot, string> = {
        avatarDecoration: "pendingAvatarDecoration",
        nameplate: "pendingNameplate",
        profileEffect: "pendingProfileEffect",
        profileFrame: "pendingProfileFrame"
    };
    const skuFields: Record<CollectibleSlot, string> = {
        avatarDecoration: "avatarDecorationSkuId",
        nameplate: "nameplateSkuId",
        profileEffect: "profileEffectId",
        profileFrame: "profileFrameSkuId"
    };

    const collectibles: Record<string, unknown> = {};
    for (const slot of SLOTS) {
        const fromEditor = old.editorState?.[pendingKeys[slot]];
        if (old.editorState && pendingKeys[slot] in old.editorState) {
            collectibles[slot] = fromEditor?.skuId
                ? { skuId: String(fromEditor.skuId), data: fromEditor.__unresolved ? undefined : fromEditor }
                : null;
        } else if (old[skuFields[slot]]) {
            collectibles[slot] = { skuId: String(old[skuFields[slot]]) };
        }
    }

    return sanitizePreset({
        name: old.name,
        createdAt: old.createdAt,
        avatar: image(old.avatar, old.avatarHash),
        banner: image(old.banner, old.bannerHash),
        bio: old.bio ?? undefined,
        themeColors: old.themeColors ?? undefined,
        collectibles,
        widgets: Array.isArray(old.widgets) && old.widgets.length > 0 ? old.widgets : undefined
    }, false);
}

// #endregion
