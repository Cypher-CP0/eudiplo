import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { TenantEntity } from "../../../../auth/tenant/entitites/tenant.entity";
import { StatusListEntity } from "./status-list.entity";

/**
 * Index supporting the "active credential slot" lookup used by the
 * active-credential-limit policy: given a tenant, credential configuration and
 * pseudonymous subject key, find the currently active status entries so they
 * can be invalidated when a new credential is issued to the same subject.
 */
@Index("IDX_status_mapping_subject", [
    "tenantId",
    "credentialConfigurationId",
    "subjectKey",
])

@Entity()
export class StatusMapping {
    @Column({ type: "varchar", primary: true })
    tenantId!: string;

    /**
     * The tenant that owns this object.
     */
    @ManyToOne(() => TenantEntity, { cascade: true, onDelete: "CASCADE" })
    tenant!: TenantEntity;

    @Column({ type: "varchar", primary: true })
    sessionId!: string;

    /**
     * The ID of the status list this mapping belongs to.
     */
    @Column({ type: "varchar", primary: true })
    statusListId!: string;

    /**
     * The status list entity.
     */
    @ManyToOne(() => StatusListEntity, { onDelete: "CASCADE" })
    @JoinColumn([
        { name: "statusListId", referencedColumnName: "id" },
        { name: "tenantId", referencedColumnName: "tenantId" },
    ])
    statusList!: StatusListEntity;

    /**
     * The full URI of the status list (for backward compatibility and quick lookups).
     */
    @Column({ type: "varchar" })
    list!: string;

    @Column({ type: "int", primary: true })
    index!: number;

    @Column({ type: "varchar", primary: true })
    credentialConfigurationId!: string;

    /**
     * Pseudonymous, per-(tenant, credential-config) subject key derived from the
     * authorization identity (iss + sub) via HMAC. Only populated when the
     * credential configuration enables the active-credential-limit policy with
     * internal tracking; otherwise null.
     *
     * This is deliberately NOT part of the primary key: a subject has many
     * mappings over time (one active set plus previously invalidated ones), and
     * the value is nullable for all credentials issued without the policy.
     *
     * The raw iss/sub are never stored; only this keyed hash is persisted, and
     * scoping the HMAC input per credentialConfigurationId prevents correlating
     * the same person across different credential types via this column.
     */
    @Column({ type: "varchar", nullable: true })
    subjectKey?: string | null;
}
