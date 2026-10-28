/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { showToast } from "@webpack/common";

export const cl = classNameFactory("vc-pp-");
export const logger = new Logger("ProfilePresets");

export const MAX_NAME_LENGTH = 40;

export function toast(text: string, variant: "default" | "success" | "critical" = "default") {
    try {
        showToast({ text, variant });
    } catch (err) {
        logger.warn("Couldn't show toast", err);
    }
}

export function errorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
}

export function blobToDataUri(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export async function fetchAsDataUri(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image download failed (HTTP ${res.status})`);
    return blobToDataUri(await res.blob());
}

export function cdnImageUrl(kind: "avatars" | "banners", userId: string, hash: string, size: number) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/${kind}/${userId}/${hash}.${ext}?size=${size}`;
}

export function colorToCss(color: number) {
    return "#" + (color >>> 0).toString(16).padStart(6, "0").slice(-6);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
export function formatDate(timestamp: number) {
    try {
        return dateFormat.format(timestamp);
    } catch {
        return "";
    }
}

export function sameJson(a: unknown, b: unknown) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
