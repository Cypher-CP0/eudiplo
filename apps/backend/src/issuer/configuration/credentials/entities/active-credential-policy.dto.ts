import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from "class-validator";

/**
 * Tracking modes for the active-credential-limit policy.
 *
 * - `internal`: EUDIPLO derives a pseudonymous subject key from the
 *   authorization identity (iss + sub) and stores it alongside the status
 *   mapping, so it can find and invalidate a subject's previously issued
 *   credentials when a new one is issued. The raw identity is never persisted.
 * - `external`: EUDIPLO stores no subject key; the integrating backend is
 *   responsible for telling EUDIPLO which previously issued credentials to
 *   invalidate. Reserved for a follow-up — not yet implemented (issue #843).
 */
export type ActiveCredentialTracking = "internal" | "external";

/**
 * Per-credential-configuration policy limiting how many credentials of this
 * configuration a single subject may hold active at once.
 *
 * When enabled with `internal` tracking, issuing a new credential to a subject
 * invalidates the credentials previously issued to that same subject for this
 * configuration, so at most one active set exists per subject at a time.
 *
 * This policy is credential-configuration driven (not issuer-wide) so it can be
 * scoped to specific credential types. It is defined inline for now; a future
 * change may allow defining reusable policy objects that configurations link to.
 */
export class ActiveCredentialPolicy {
    /**
     * Whether the active-credential-limit policy is enabled for this
     * credential configuration.
     */
    @IsBoolean()
    @ApiProperty({
        description:
            "Enable limiting the number of simultaneously active credentials per subject for this credential configuration.",
        default: false,
    })
    enabled!: boolean;

    /**
     * How the set of a subject's active credentials is tracked.
     *
     * Only `internal` is currently supported. `external` is reserved for a
     * follow-up and is rejected by validation until implemented.
     */
    @IsOptional()
    @IsIn(["internal"])
    @ApiProperty({
        description:
            "How the subject's active credential set is tracked. Only 'internal' is currently supported; 'external' is reserved for a future release.",
        enum: ["internal", "external"],
        default: "internal",
    })
    tracking?: ActiveCredentialTracking;

    /**
     * Maximum number of active credentials a subject may hold for this
     * configuration. Defaults to 1 (single active credential) when not set.
     *
     * Included for forward compatibility; the initial implementation targets
     * the single-active-credential case.
     */
    @IsOptional()
    @IsInt()
    @Min(1)
    @ApiProperty({
        description:
            "Maximum number of simultaneously active credentials per subject. Defaults to 1.",
        default: 1,
        required: false,
    })
    maxActive?: number;
}
