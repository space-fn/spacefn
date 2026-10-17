import type { TenantStatus } from "./resolve";

/** How long a deleted tenant can be restored before it may be purged. */
export const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type TenantAction = "suspend" | "resume" | "delete" | "restore";

export interface LifecycleState {
	status: TenantStatus;
	/** Epoch milliseconds when the tenant was deleted. Set only while deleted. */
	deletedAt?: number;
}

export class TenantTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TenantTransitionError";
	}
}

/**
 * Applies one lifecycle action. Invalid moves throw, so a route cannot skip a
 * step. Purged is final.
 */
export function transition(
	state: LifecycleState,
	action: TenantAction,
	now: number,
): LifecycleState {
	switch (action) {
		case "suspend":
			if (state.status !== "active")
				throw new TenantTransitionError(
					`Only an active tenant can be suspended, not ${state.status}`,
				);
			return { status: "suspended" };
		case "resume":
			if (state.status !== "suspended")
				throw new TenantTransitionError(
					`Only a suspended tenant can be resumed, not ${state.status}`,
				);
			return { status: "active" };
		case "delete":
			if (state.status !== "active" && state.status !== "suspended") {
				throw new TenantTransitionError(`A ${state.status} tenant cannot be deleted`);
			}
			return { status: "deleted", deletedAt: now };
		case "restore":
			if (state.status !== "deleted" || state.deletedAt === undefined) {
				throw new TenantTransitionError(
					`Only a deleted tenant can be restored, not ${state.status}`,
				);
			}
			if (now >= state.deletedAt + GRACE_MS) {
				throw new TenantTransitionError(
					"The grace period has ended; this tenant can no longer be restored",
				);
			}
			return { status: "active" };
	}
}

/** True once a deleted tenant has passed its grace period and may be purged. */
export function isPurgeDue(state: LifecycleState, now: number): boolean {
	return (
		state.status === "deleted" && state.deletedAt !== undefined && now >= state.deletedAt + GRACE_MS
	);
}
