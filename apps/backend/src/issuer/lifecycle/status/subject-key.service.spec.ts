import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectKeyService } from "./subject-key.service";

function createService(rootKey: Buffer = Buffer.alloc(32, 7)) {
    const keyProvider = {
        name: "test",
        getKey: vi.fn().mockResolvedValue(rootKey),
    };

    return {
        service: new SubjectKeyService(keyProvider as any),
        keyProvider,
    };
}

const baseParams = {
    tenantId: "tenant-a",
    credentialConfigurationId: "employee-card",
    iss: "https://as.example.com",
    sub: "user-123",
};

describe("SubjectKeyService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("derives a hex-encoded value", async () => {
        const { service } = createService();

        const key = await service.deriveSubjectKey(baseParams);

        expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same inputs", async () => {
        const { service } = createService();

        const a = await service.deriveSubjectKey(baseParams);
        const b = await service.deriveSubjectKey(baseParams);

        expect(a).toBe(b);
    });

    it("fetches the root key from the provider only once across multiple derivations", async () => {
        const { service, keyProvider } = createService();

        await service.deriveSubjectKey(baseParams);
        await service.deriveSubjectKey({ ...baseParams, sub: "user-456" });
        await service.deriveSubjectKey({
            ...baseParams,
            credentialConfigurationId: "diploma",
        });

        expect(keyProvider.getKey).toHaveBeenCalledTimes(1);
    });

    it("produces different keys for different credential configurations (correlation resistance)", async () => {
        const { service } = createService();

        const employeeCard = await service.deriveSubjectKey(baseParams);
        const diploma = await service.deriveSubjectKey({
            ...baseParams,
            credentialConfigurationId: "diploma",
        });

        expect(employeeCard).not.toBe(diploma);
    });

    it("produces different keys for different tenants", async () => {
        const { service } = createService();

        const tenantA = await service.deriveSubjectKey(baseParams);
        const tenantB = await service.deriveSubjectKey({
            ...baseParams,
            tenantId: "tenant-b",
        });

        expect(tenantA).not.toBe(tenantB);
    });

    it("produces different keys for different subjects", async () => {
        const { service } = createService();

        const userA = await service.deriveSubjectKey(baseParams);
        const userB = await service.deriveSubjectKey({
            ...baseParams,
            sub: "user-456",
        });

        expect(userA).not.toBe(userB);
    });

    it("produces different keys for different issuers", async () => {
        const { service } = createService();

        const issuerA = await service.deriveSubjectKey(baseParams);
        const issuerB = await service.deriveSubjectKey({
            ...baseParams,
            iss: "https://other-as.example.com",
        });

        expect(issuerA).not.toBe(issuerB);
    });

    it("produces different keys when the root key differs (e.g. different tenant secret rotation)", async () => {
        const { service: serviceA } = createService(Buffer.alloc(32, 1));
        const { service: serviceB } = createService(Buffer.alloc(32, 2));

        const keyA = await serviceA.deriveSubjectKey(baseParams);
        const keyB = await serviceB.deriveSubjectKey(baseParams);

        expect(keyA).not.toBe(keyB);
    });
});
