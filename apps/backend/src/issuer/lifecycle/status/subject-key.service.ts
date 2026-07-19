import { createHmac, hkdfSync } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
    ENCRYPTION_KEY_PROVIDER,
    EncryptionKeyProvider,
} from "../../../shared/utils/encryption/providers/encryption-key-provider.interface";

/**
 * Derives pseudonymous, per-(tenant, credential-config) subject keys for the
 * active-credential-limit policy (issue #843).
 *
 * The subject key is an HMAC-SHA256 of the authorization identity (iss + sub),
 * scoped to a tenant and credential configuration. It lets EUDIPLO find and
 * invalidate a subject's previously issued credentials without ever storing
 * the raw iss/sub anywhere (see StatusMapping.subjectKey).
 *
 * Key handling:
 * - The HMAC key is derived via HKDF from the same root key already used for
 *   at-rest encryption (fetched through the existing ENCRYPTION_KEY_PROVIDER,
 *   which in turn is sourced from env/vault/aws/azure per deployment). A
 *   distinct HKDF "info" string keeps this key cryptographically independent
 *   from the at-rest encryption key derived by EncryptionService.
 * - The derived HMAC key is kept only in memory (never persisted) and is
 *   derived once per process, matching the pattern EncryptionService already
 *   uses for its own key.
 *
 * Correlation resistance:
 * - The HMAC input includes credentialConfigurationId, so the subject key for
 *   the same person differs across credential types. This is a deliberate
 *   analogue to `tag: "IDX_status_mapping_subject"` — a reviewer checking
 *   this table cannot join two credential types by subjectKey alone.
 */
@Injectable()
export class SubjectKeyService {
    private static readonly HKDF_INFO = "eudiplo-active-credential-subject-key";
    private static readonly HKDF_KEY_LENGTH = 32;

    private hmacKey: Buffer | null = null;
    private hmacKeyPromise: Promise<Buffer> | null = null;
    private readonly logger = new Logger(SubjectKeyService.name);

    constructor(
        @Inject(ENCRYPTION_KEY_PROVIDER)
        private readonly keyProvider: EncryptionKeyProvider,
    ) {}

    /**
     * Derive a pseudonymous subject key from the authorization identity.
     *
     * @param params.tenantId The tenant the credential is being issued under.
     * @param params.credentialConfigurationId The credential configuration
     *   being issued. Scoping the key to this prevents correlating the same
     *   subject across different credential types via this value.
     * @param params.iss The authorization server issuer (iss claim).
     * @param params.sub The subject identifier (sub claim), expected to be
     *   durable per-user for the authorization flow in use. Callers are
     *   responsible for ensuring `sub` is not session-scoped (e.g. the
     *   built-in authorization server's local flow uses a session-scoped
     *   `sub` and should not use this policy until that is addressed
     *   separately).
     * @returns A hex-encoded HMAC-SHA256 digest, safe to persist.
     */
    async deriveSubjectKey(params: {
        tenantId: string;
        credentialConfigurationId: string;
        iss: string;
        sub: string;
    }): Promise<string> {
        const key = await this.getHmacKey();
        const message = [
            params.tenantId,
            params.credentialConfigurationId,
            params.iss,
            params.sub,
        ].join("|");

        return createHmac("sha256", key).update(message).digest("hex");
    }

    /**
     * Lazily derive and cache the HMAC key for this process.
     */
    private async getHmacKey(): Promise<Buffer> {
        if (this.hmacKey) {
            return this.hmacKey;
        }

        if (!this.hmacKeyPromise) {
            this.hmacKeyPromise = this.deriveHmacKey();
        }

        this.hmacKey = await this.hmacKeyPromise;
        return this.hmacKey;
    }

    private async deriveHmacKey(): Promise<Buffer> {
        this.logger.log(
            `Deriving subject-key HMAC secret via provider: ${this.keyProvider.name}`,
        );

        const rootKey = await this.keyProvider.getKey();

        return Buffer.from(
            hkdfSync(
                "sha256",
                rootKey,
                "", // salt - empty, matching the at-rest encryption key derivation
                SubjectKeyService.HKDF_INFO,
                SubjectKeyService.HKDF_KEY_LENGTH,
            ),
        );
    }
}
