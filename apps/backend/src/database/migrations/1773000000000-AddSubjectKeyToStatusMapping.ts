import {
    MigrationInterface,
    QueryRunner,
    TableColumn,
    TableIndex,
} from "typeorm";

/**
 * Add subject-key tracking to the status mapping table for the
 * active-credential-limit policy (issue #843).
 *
 * - status_mapping: adds a nullable `subjectKey` column holding a pseudonymous,
 *   per-(tenant, credential-config) HMAC of the authorization identity. It is
 *   only populated when a credential configuration enables the policy with
 *   internal tracking; existing rows and all non-policy issuance keep it null,
 *   so this change is backwards compatible.
 * - Adds a non-unique index on (tenantId, credentialConfigurationId, subjectKey)
 *   to support looking up the currently active status entries for a subject.
 *
 * The column is intentionally NOT part of the primary key: a subject
 * legitimately has many mappings over time (the current active set plus
 * previously invalidated ones).
 */
export class AddSubjectKeyToStatusMapping1773000000000
    implements MigrationInterface
{
    name = "AddSubjectKeyToStatusMapping1773000000000";

    private readonly indexName = "IDX_status_mapping_subject";

    public async up(queryRunner: QueryRunner): Promise<void> {
        const tableName = await this.resolveTableName(queryRunner);
        if (!tableName) {
            console.log(
                "[Migration] status mapping table not found — skipping AddSubjectKeyToStatusMapping.",
            );
            return;
        }

        const table = await queryRunner.getTable(tableName);
        if (!table) {
            return;
        }

        if (!table.columns.some((col) => col.name === "subjectKey")) {
            await queryRunner.addColumn(
                tableName,
                new TableColumn({
                    name: "subjectKey",
                    type: "varchar",
                    isNullable: true,
                }),
            );
            console.log(`[Migration] Added subjectKey column to ${tableName}.`);
        }

        if (!table.indices.some((idx) => idx.name === this.indexName)) {
            await queryRunner.createIndex(
                tableName,
                new TableIndex({
                    name: this.indexName,
                    columnNames: [
                        "tenantId",
                        "credentialConfigurationId",
                        "subjectKey",
                    ],
                }),
            );
            console.log(
                `[Migration] Added ${this.indexName} index to ${tableName}.`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const tableName = await this.resolveTableName(queryRunner);
        if (!tableName) {
            return;
        }

        const table = await queryRunner.getTable(tableName);
        if (!table) {
            return;
        }

        if (table.indices.some((idx) => idx.name === this.indexName)) {
            await queryRunner.dropIndex(tableName, this.indexName);
            console.log(
                `[Migration] Removed ${this.indexName} index from ${tableName}.`,
            );
        }

        if (table.columns.some((col) => col.name === "subjectKey")) {
            await queryRunner.dropColumn(tableName, "subjectKey");
            console.log(
                `[Migration] Removed subjectKey column from ${tableName}.`,
            );
        }
    }

    private async resolveTableName(
        queryRunner: QueryRunner,
    ): Promise<string | null> {
        const candidates = ["status_mapping", "status_mapping_entity"];
        for (const candidate of candidates) {
            const table = await queryRunner.getTable(candidate);
            if (table) {
                return candidate;
            }
        }
        return null;
    }
}
