/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type CollectibleSlot = "avatarDecoration" | "nameplate" | "profileEffect" | "profileFrame";

export interface StoredImage {
    /** Discord asset hash at capture time. Used to skip re-uploading an image that's already set. */
    hash: string | null;
    dataUri: string;
}

export interface CollectibleRef {
    skuId: string;
    /** The object Discord's profile editor uses for this item, when it's known. */
    data?: Record<string, unknown>;
}

/**
 * A saved look. Optional fields that are missing are left untouched when the
 * preset is loaded. For collectibles, a missing slot is left untouched and
 * `null` means "nothing equipped".
 */
export interface Preset {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;

    avatar?: StoredImage;
    banner?: StoredImage;
    bio?: string;
    themeColors?: [number, number] | null;

    collectibles: Partial<Record<CollectibleSlot, CollectibleRef | null>>;

    /** Profile Board widgets, as the payloads Discord's widget API takes. */
    widgets?: unknown[];
}

export interface ExportFile {
    format: "vc-profile-presets";
    version: 1;
    presets: Preset[];
}
