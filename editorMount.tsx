/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot } from "@webpack/common";
import type { Root } from "react-dom/client";

import { EditorSection } from "./components/EditorSection";
import { settings } from "./settings";
import { cl, logger } from "./utils";

// The profile editor sidebar has no API to hook into, so the section is placed by
// finding the sidebar through its section titles (see settings), then rendered
// with React. A MutationObserver keeps it mounted while the editor is open.

let observer: MutationObserver | null = null;
let scheduled: number | null = null;
let mounted: { node: HTMLElement; root: Root; } | null = null;

function findByText(text: string): HTMLElement | null {
    if (!text) return null;
    const xpath = `//*[normalize-space(text())=${JSON.stringify(text.trim())}]`;
    try {
        return document.evaluate(xpath, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;
    } catch {
        return null;
    }
}

function unmount() {
    if (!mounted) return;
    mounted.root.unmount();
    mounted.node.remove();
    mounted = null;
}

function sync() {
    scheduled = null;
    if (mounted && !mounted.node.isConnected) unmount();

    const first = findByText(settings.store.firstSectionTitle);
    const last = findByText(settings.store.lastSectionTitle);
    if (!first || !last) return unmount();

    let sidebar = first.parentElement;
    while (sidebar && !sidebar.contains(last)) sidebar = sidebar.parentElement;
    if (!sidebar) return unmount();
    if (mounted && sidebar.contains(mounted.node)) return;

    unmount();
    try {
        const node = document.createElement("div");
        node.className = cl("mount");
        sidebar.append(node);
        const root = createRoot(node);
        root.render(
            <ErrorBoundary noop>
                <EditorSection headingClassName={last.className} />
            </ErrorBoundary>
        );
        mounted = { node, root };
    } catch (err) {
        logger.error("Couldn't add the Presets section", err);
    }
}

function schedule() {
    scheduled ??= window.setTimeout(sync, 150);
}

export function isEditorOpen() {
    return mounted?.node.isConnected ?? false;
}

export function startEditorMount() {
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
}

export function stopEditorMount() {
    observer?.disconnect();
    observer = null;
    if (scheduled != null) clearTimeout(scheduled);
    scheduled = null;
    unmount();
}
