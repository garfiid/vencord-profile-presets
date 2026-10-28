/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Preset } from "../types";
import { cl, colorToCss } from "../utils";

/** Small preview of a preset: its banner (or profile colors) with the avatar on top. */
export function Thumbnail({ preset, variant }: { preset: Preset; variant: "row" | "tile"; }) {
    const colors = preset.themeColors;
    const background = !preset.banner && colors
        ? `linear-gradient(${colorToCss(colors[0])}, ${colorToCss(colors[1])})`
        : undefined;

    return (
        <div className={cl("thumb", `thumb-${variant}`)} aria-hidden="true">
            <div className={cl("thumb-banner")} style={background ? { background } : undefined}>
                {preset.banner && <img src={preset.banner.dataUri} alt="" draggable={false} />}
            </div>
            <div className={cl("thumb-avatar")}>
                {preset.avatar && <img src={preset.avatar.dataUri} alt="" draggable={false} />}
            </div>
        </div>
    );
}
