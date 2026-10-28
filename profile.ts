/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findStoreLazy } from "@webpack";
import { FluxDispatcher, RestAPI, UserProfileStore, UserStore } from "@webpack/common";

import { getCachedItem, rememberItems, SLOTS } from "./storage";
import type { CollectibleRef, CollectibleSlot, Preset, StoredImage } from "./types";
import { cdnImageUrl, clone, fetchAsDataUri, logger, sameJson } from "./utils";

// How it works: loading a preset never sends your profile to Discord. It fills
// Discord's own profile editor (its "pending changes"), and you click Save. That's
// a single request sent by Discord itself, exactly like editing by hand, so there's
// no burst of API calls to trigger rate limits or captchas.

const SET_PENDING = "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES";

const PENDING_KEY: Record<CollectibleSlot, string> = {
    avatarDecoration: "pendingAvatarDecoration",
    nameplate: "pendingNameplate",
    profileEffect: "pendingProfileEffect",
    profileFrame: "pendingProfileFrame"
};

export const SLOT_LABEL: Record<CollectibleSlot, string> = {
    avatarDecoration: "Avatar decoration",
    nameplate: "Nameplate",
    profileEffect: "Profile effect",
    profileFrame: "Profile frame"
};

interface PendingChangesStore {
    getPendingChanges(guildId?: string): Record<string, any> | undefined;
}

interface WidgetsStore {
    getWidgets(userId: string): Array<{ toSubmission?(): unknown; }> | undefined;
}

const ProfileSettingsStore: PendingChangesStore = findStoreLazy("UserProfileSettingsStore");
const WidgetActions: { savePendingWidgets(widgets: Array<{ toSubmission(): unknown; }>): Promise<void>; } =
    findByPropsLazy("setPendingWidgets", "savePendingWidgets");

function getPendingChanges(): Record<string, any> {
    try {
        return ProfileSettingsStore.getPendingChanges() ?? {};
    } catch {
        return {};
    }
}

/** Remembers the full data of items equipped in the editor (see storage.ts). */
export function onPendingChanges(action: Record<string, unknown>) {
    rememberItems(SLOTS.map(slot => action[PENDING_KEY[slot]]));
}

async function fetchOwnProfile(userId: string): Promise<Record<string, any> | null> {
    try {
        const res = await RestAPI.get({
            url: `/users/${userId}/profile`,
            query: { with_mutual_guilds: false, with_mutual_friends_count: false, type: "you_screen" }
        });
        return res?.body ?? null;
    } catch (err) {
        logger.warn("Couldn't fetch own profile", err);
        return null;
    }
}

function getWidgets(userId: string): unknown[] | undefined {
    try {
        const widgets = (UserProfileStore as unknown as WidgetsStore).getWidgets(userId);
        if (!Array.isArray(widgets)) return;
        return clone(widgets.map(w => typeof w?.toSubmission === "function" ? w.toSubmission() : w));
    } catch (err) {
        logger.warn("Couldn't read widgets", err);
        return;
    }
}

function hasKey(obj: object, key: string) {
    return Object.prototype.hasOwnProperty.call(obj, key) && (obj as Record<string, unknown>)[key] !== undefined;
}

function refFromEditor(value: any): CollectibleRef | null {
    if (!value?.skuId) return null;
    return { skuId: String(value.skuId), data: clone(value) };
}

function refFromSku(skuId: unknown, fallback?: Record<string, unknown>): CollectibleRef | null {
    if (skuId == null || skuId === "" || skuId === "0") return null;
    const id = String(skuId);
    const data = getCachedItem(id) ?? fallback;
    return data ? { skuId: id, data } : { skuId: id };
}

/** Collectibles you have equipped right now, read from your own profile. */
function equippedCollectibles(profile: Record<string, any> | null): Preset["collectibles"] {
    const result: Preset["collectibles"] = {};
    if (!profile) return result;
    const user = profile.user ?? {};
    const userProfile = profile.user_profile ?? {};

    if ("avatar_decoration_data" in user) {
        const d = user.avatar_decoration_data;
        result.avatarDecoration = d ? refFromSku(d.sku_id, d.asset ? { skuId: String(d.sku_id), asset: d.asset, type: 0 } : undefined) : null;
    }
    if ("collectibles" in user) {
        const n = user.collectibles?.nameplate;
        result.nameplate = n
            ? refFromSku(n.sku_id, n.asset ? { skuId: String(n.sku_id), asset: n.asset, label: n.label, palette: n.palette, type: 2 } : undefined)
            : null;
    }
    if ("profile_effect" in userProfile) {
        const e = userProfile.profile_effect;
        result.profileEffect = e ? refFromSku(e.sku_id ?? e.id) : null;
    }
    return result;
}

async function captureImage(pendingValue: any, hash: string | null | undefined, url: () => string): Promise<StoredImage | undefined> {
    const pendingUri = pendingValue?.imageUri;
    if (typeof pendingUri === "string" && pendingUri.startsWith("data:")) return { hash: null, dataUri: pendingUri };
    if (!hash) return;
    return { hash, dataUri: await fetchAsDataUri(url()) };
}

/**
 * Captures your profile as it looks right now in the editor: saved settings,
 * plus any change you made in the editor but haven't saved yet.
 */
export async function captureProfile(name: string): Promise<Preset> {
    const me = UserStore.getCurrentUser();
    if (!me) throw new Error("Discord hasn't loaded your account yet");

    const pending = getPendingChanges();
    const profile = await fetchOwnProfile(me.id);
    const userProfile = profile?.user_profile ?? {};
    const bannerHash: string | null = userProfile.banner ?? profile?.user?.banner ?? (me as any).banner ?? null;

    const [avatar, banner] = await Promise.all([
        captureImage(pending.pendingAvatar, me.avatar, () => cdnImageUrl("avatars", me.id, me.avatar!, 512)),
        captureImage(pending.pendingBanner, bannerHash, () => cdnImageUrl("banners", me.id, bannerHash!, 1024))
    ]);

    const collectibles = equippedCollectibles(profile);
    for (const slot of SLOTS) {
        if (hasKey(pending, PENDING_KEY[slot])) collectibles[slot] = refFromEditor(pending[PENDING_KEY[slot]]);
    }
    rememberItems(SLOTS.map(slot => pending[PENDING_KEY[slot]]));

    const now = Date.now();
    const preset: Preset = { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now, collectibles };

    if (avatar) preset.avatar = avatar;
    if (banner) preset.banner = banner;

    if (hasKey(pending, "pendingBio")) preset.bio = String(pending.pendingBio ?? "");
    else if (typeof userProfile.bio === "string") preset.bio = userProfile.bio;

    if (hasKey(pending, "pendingThemeColors")) preset.themeColors = pending.pendingThemeColors ?? null;
    else if (profile) preset.themeColors = Array.isArray(userProfile.theme_colors) ? [userProfile.theme_colors[0], userProfile.theme_colors[1]] : null;

    const widgets = getWidgets(me.id);
    if (widgets) preset.widgets = widgets;

    return preset;
}

/**
 * Loads a preset into the profile editor. Nothing is saved until you click
 * Discord's Save. Returns notes about anything that couldn't be loaded.
 */
export async function loadIntoEditor(preset: Preset): Promise<string[]> {
    const me = UserStore.getCurrentUser();
    if (!me) throw new Error("Discord hasn't loaded your account yet");

    const notes: string[] = [];
    const changes: Record<string, unknown> = {};

    if (preset.avatar && (!preset.avatar.hash || preset.avatar.hash !== me.avatar)) {
        changes.pendingAvatar = { assetOrigin: "NEW_ASSET", imageUri: preset.avatar.dataUri };
    }

    if (preset.banner) {
        const currentBanner = UserProfileStore.getUserProfile(me.id)?.banner ?? (me as any).banner ?? null;
        if (!preset.banner.hash || preset.banner.hash !== currentBanner) {
            const uri = preset.banner.dataUri;
            changes.pendingBanner = uri.startsWith("data:image/gif")
                ? { assetOrigin: "NEW_ASSET", imageUri: uri }
                : { assetOrigin: "NEW_ASSET", imageUri: uri, staticImageUri: uri };
        }
    }

    if (preset.bio !== undefined) changes.pendingBio = preset.bio;
    if (preset.themeColors !== undefined) changes.pendingThemeColors = preset.themeColors;

    for (const slot of SLOTS) {
        if (!(slot in preset.collectibles)) continue;
        const ref = preset.collectibles[slot];
        if (ref === null || ref === undefined) {
            changes[PENDING_KEY[slot]] = null;
            continue;
        }
        const data = getCachedItem(ref.skuId) ?? ref.data;
        if (data) changes[PENDING_KEY[slot]] = data;
        else notes.push(`${SLOT_LABEL[slot]}: equip it once by hand`);
    }

    FluxDispatcher.dispatch({ type: SET_PENDING, ...changes });

    if (preset.widgets && preset.widgets.length > 0 && !sameJson(preset.widgets, getWidgets(me.id))) {
        try {
            await WidgetActions.savePendingWidgets(preset.widgets.map(w => ({ toSubmission: () => w })));
        } catch (err) {
            logger.warn("Couldn't restore widgets", err);
            notes.push("widgets couldn't be restored");
        }
    }

    return notes;
}
