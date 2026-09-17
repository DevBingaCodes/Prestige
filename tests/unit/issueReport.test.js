// Controllers should not reach Postgres, email, or notifications during unit tests.
jest.mock("../../config/db", () => ({ query: jest.fn() }));
jest.mock("../../controllers/emailService", () => ({
    sendIssueReportEmail: jest.fn(),
    technicianAssignmentEmail: jest.fn(),
    sendIssueSubmissionEmailAdmin: jest.fn(),
}));
jest.mock("../../controllers/notifications", () => ({ createNotification: jest.fn() }));

const client = require("../../config/db");
const {
    sendIssueReportEmail,
    technicianAssignmentEmail,
    sendIssueSubmissionEmailAdmin,
} = require("../../controllers/emailService");
const { createNotification } = require("../../controllers/notifications");
const {
    getAllIsues,
    getMyReportIssues,
    reportIssue,
    assignTechnician,
    resolveIssue,
} = require("../../controllers/issueReport");

// Only include response methods used by these controllers.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Get All Issues Test
describe("getAllIsues", () => {
    it("returns all issue reports", async () => {
        const issues = [{ issue_id: 1, status: "OPEN" }];
        client.query.mockResolvedValueOnce({ rows: issues });
        const res = createResponse();

        await getAllIsues({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(issues);
    });
});

// My Issues test
describe("getMyReportIssues", () => {
    it("returns issue reports for the authenticated tenant", async () => {
        const issues = [{ issue_id: 1, tenant_id: 4, status: "OPEN" }];
        client.query.mockResolvedValueOnce({ rows: issues });
        const res = createResponse();

        await getMyReportIssues({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(issues);
    });
});

// Report issue test
describe("reportIssue", () => {
    it("creates an issue and emails the tenant and administrator", async () => {
        // Tenant lookup, issue insert, then administrator lookup.
        client.query
            .mockResolvedValueOnce({ rows: [{ email: "tenant@example.com" }] })
            .mockResolvedValueOnce({ rows: [{ issue_id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ email: "admin@example.com" }] });
        sendIssueReportEmail.mockResolvedValueOnce();
        sendIssueSubmissionEmailAdmin.mockResolvedValueOnce();
        const res = createResponse();

        await reportIssue({
            tenantId: 4,
            body: { issueDescription: "Leaking tap", category: "Plumbing", priority: "high" },
        }, res);

        expect(sendIssueReportEmail).toHaveBeenCalledWith("tenant@example.com", "Plumbing");
        expect(sendIssueSubmissionEmailAdmin).toHaveBeenCalledWith("admin@example.com", "Plumbing", 4);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: "Issue reported successfully", issue_id: 1 });
    });
});

// Assign technician
describe("assignTechnician", () => {
    it("assigns an available specialist and notifies the tenant", async () => {
        const technician = { technician_id: 8, name: "Amina", phone_number: "0712345678" };
        // Issue, available technician, two status updates, then tenant email lookup.
        client.query
            .mockResolvedValueOnce({ rows: [{ tenant_id: 4, category: "Plumbing" }] })
            .mockResolvedValueOnce({ rows: [technician] })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ rows: [{ email: "tenant@example.com" }] });
        technicianAssignmentEmail.mockResolvedValueOnce();
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await assignTechnician({ body: { issueId: 1 } }, res);

        expect(technicianAssignmentEmail).toHaveBeenCalledWith("tenant@example.com", "Amina", "0712345678", "Plumbing");
        expect(createNotification).toHaveBeenCalledWith(4, expect.stringContaining("Amina"));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Technician assigned successfully.", technician: "Amina", issueId: 1 });
    });
});

// Resolve tenant issue
describe("resolveIssue", () => {
    it("resolves the tenant's open issue and creates a notification", async () => {
        const resolvedDate = new Date("2026-09-17T12:00:00Z");
        // The controller first checks ownership/status, then updates the issue.
        client.query
            .mockResolvedValueOnce({ rows: [{ status: "OPEN" }] })
            .mockResolvedValueOnce({ rows: [{ issue_id: 1, status: "RESOLVED", resolved_date: resolvedDate }] });
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await resolveIssue({ tenantId: 4, params: { issueId: 1 } }, res);

        expect(createNotification).toHaveBeenCalledWith(4, "Thank you, your recent issue report was resolved.");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Issue resolved successfully",
            issue_id: 1,
            status: "RESOLVED",
            resolved_date: resolvedDate,
        });
    });
});
