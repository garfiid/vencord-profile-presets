/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Emma
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, TextInput, useState } from "@webpack/common";

import { validateName } from "../storage";
import { errorMessage, MAX_NAME_LENGTH } from "../utils";

interface NameModalProps extends RenderModalProps {
    title: string;
    subtitle?: string;
    confirmText: string;
    initialValue?: string;
    /** Preset to ignore when checking for duplicate names (when renaming). */
    ignoreId?: string;
    onSubmit(name: string): Promise<void>;
}

export function NameModal({ title, subtitle, confirmText, initialValue = "", ignoreId, onSubmit, ...props }: NameModalProps) {
    const [name, setName] = useState(initialValue);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (busy) return;
        const problem = validateName(name, ignoreId);
        if (problem) return setError(problem);

        setBusy(true);
        try {
            await onSubmit(name.trim());
            props.onClose();
        } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
        }
    }

    return (
        <Modal
            {...props}
            size="sm"
            title={title}
            subtitle={subtitle}
            actions={[
                { text: "Cancel", variant: "secondary", onClick: props.onClose },
                { text: confirmText, variant: "primary", onClick: submit, loading: busy }
            ]}
        >
            <TextInput
                autoFocus
                value={name}
                placeholder="Preset name"
                maxLength={MAX_NAME_LENGTH}
                error={error}
                onChange={value => { setName(value); setError(undefined); }}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
            />
        </Modal>
    );
}
