import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../../session/entities/session.entity";
import { StatusListService } from "./status-list.service";

/**
 * Focused unit tests for the active-credential-limit replace behavior in
 * StatusListService.createEntry (issue #843).
 *
 * These tests stub the list-allocation machinery and assert only the policy
 * logic: when a subject key is derived, when previous entries are invalidated,
 * and the critical issue-before-invalidate ordering.
 */

const STATUS_REVOKED = 1;

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: "session-1",
        tenantId: "tenant-a",
        ...overrides,
    } as Session;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: "employee-card",
        statusManagement: true,
        activeCredentials: { enabled: true, tracking: "internal" },
        ...overrides,
    } as any;
}

describe("StatusListService.createEntry — active credential limit", () => {
    let service: StatusListService;
    let statusMappingRepository: {
        save: ReturnType<typeof vi.fn>;
        findBy: ReturnType<typeof vi.fn>;
    };
    let subjectKeyService: { deriveSubjectKey: ReturnType<typeof vi.fn> };
    let setEntry: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        statusMappingRepository = {
            save: vi.fn().mockResolvedValue(undefined),
            findBy: vi.fn().mockResolvedValue([]),
        };
        subjectKeyService = {
            deriveSubjectKey: vi.fn().mockResolvedValue("derived-subject-key"),
        };

        service = new StatusListService(
            {} as any, // configService
            {} as any, // certService
            {} as any, // keyChainService
            statusMappingRepository as any,
            {} as any, // statusListRepository
            {} as any, // tenantRepository
            {} as any, // configImportService
            {} as any, // statusListConfigService
            { register: vi.fn() } as any, // configImportOrchestrator
            subjectKeyService as any,
        );

        // Stub the list-allocation internals so we only exercise policy logic.
        vi.spyOn(service as any, "findAvailableList").mockResolvedValue({
            id: "list-1",
            stack: [42],
        });
        vi.spyOn(service, "createNewList" as any).mockResolvedValue({
            id: "list-1",
            stack: [42],
        });
        (service as any).statusListRepository = {
            update: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(service as any, "buildStatusListUri").mockReturnValue(
            "https://issuer.example/status/list-1",
        );
        setEntry = vi
            .spyOn(service as any, "setEntry")
            .mockResolvedValue(undefined);
    });

    it("stores subjectKey and invalidates prior entries when policy applies", async () => {
        const session = makeSession({
            externalIssuer: "https://as.example.com",
            externalSubject: "user-123",
        });

        statusMappingRepository.findBy.mockResolvedValue([
            { statusListId: "list-0", index: 7 },
            { statusListId: "list-0", index: 8 },
            { statusListId: "list-1", index: 42 },
        ]);

        await service.createEntry(session, "employee-card", makeConfig());

        expect(statusMappingRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ subjectKey: "derived-subject-key" }),
        );

        expect(setEntry).toHaveBeenCalledTimes(2);
        expect(setEntry).toHaveBeenCalledWith(
            "list-0",
            7,
            STATUS_REVOKED,
            "tenant-a",
        );
        expect(setEntry).toHaveBeenCalledWith(
            "list-0",
            8,
            STATUS_REVOKED,
            "tenant-a",
        );
    });

    it("issues the new entry BEFORE invalidating old ones", async () => {
        const session = makeSession({
            externalIssuer: "https://as.example.com",
            externalSubject: "user-123",
        });
        statusMappingRepository.findBy.mockResolvedValue([
            { statusListId: "list-0", index: 7 },
        ]);

        const callOrder: string[] = [];
        statusMappingRepository.save.mockImplementation(async () => {
            callOrder.push("save-new");
        });
        setEntry.mockImplementation(async () => {
            callOrder.push("invalidate-old");
        });

        await service.createEntry(session, "employee-card", makeConfig());

        expect(callOrder).toEqual(["save-new", "invalidate-old"]);
    });

    it("does not invalidate anything if no durable subject identity is present (built-in AS)", async () => {
        const session = makeSession({
            externalIssuer: undefined,
            externalSubject: undefined,
        });

        await service.createEntry(session, "employee-card", makeConfig());

        expect(subjectKeyService.deriveSubjectKey).not.toHaveBeenCalled();
        expect(setEntry).not.toHaveBeenCalled();
        expect(statusMappingRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ subjectKey: null }),
        );
    });

    it("does not apply the policy when activeCredentials is disabled", async () => {
        const session = makeSession({
            externalIssuer: "https://as.example.com",
            externalSubject: "user-123",
        });

        await service.createEntry(
            session,
            "employee-card",
            makeConfig({ activeCredentials: { enabled: false } }),
        );

        expect(subjectKeyService.deriveSubjectKey).not.toHaveBeenCalled();
        expect(setEntry).not.toHaveBeenCalled();
    });

    it("does not apply the policy when no credential configuration is passed", async () => {
        const session = makeSession({
            externalIssuer: "https://as.example.com",
            externalSubject: "user-123",
        });

        await service.createEntry(session, "employee-card");

        expect(subjectKeyService.deriveSubjectKey).not.toHaveBeenCalled();
        expect(setEntry).not.toHaveBeenCalled();
    });

    it("skips enforcement when statusManagement is disabled", async () => {
        const session = makeSession({
            externalIssuer: "https://as.example.com",
            externalSubject: "user-123",
        });

        await service.createEntry(
            session,
            "employee-card",
            makeConfig({ statusManagement: false }),
        );

        expect(subjectKeyService.deriveSubjectKey).not.toHaveBeenCalled();
        expect(setEntry).not.toHaveBeenCalled();
    });
});
