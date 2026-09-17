// Notification controller tests use a database double instead of Postgres.
jest.mock("../../config/db", () => ({ query: jest.fn() }));

const client = require("../../config/db");
const {
    getNotifications,
    createNotification,
    getMyNotifications,
    readNotifications,
    readAllNotifications,
} = require("../../controllers/notifications");

// This mirrors only the chainable Express methods used by notification handlers.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Fetch notis test
describe("getNotifications", () => {
    it("returns all notifications", async () => {
        const notifications = [{ notification_id: 1, message: "Payment received" }];
        client.query.mockResolvedValueOnce({ rows: notifications });
        const res = createResponse();

        await getNotifications({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(notifications);
    });

    it("returns 500 when fetching notifications fails", async () => {
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getNotifications({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Could not fetch notifications." });
    });
});

// New noti test
describe("createNotification", () => {
    it("creates a notification for a tenant", async () => {
        client.query.mockResolvedValueOnce({});

        await createNotification(4, "Your booking is confirmed.");

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4, "Your booking is confirmed."]);
    });

    it("logs a database failure without throwing", async () => {
        const error = new Error("Database unavailable");
        // The helper intentionally swallows database failures, so silence and assert its log.
        const errorSpy = jest.spyOn(console, "error").mockImplementation();
        client.query.mockRejectedValueOnce(error);

        await expect(createNotification(4, "Your booking is confirmed.")).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledWith("Error creating notification:", error);
        errorSpy.mockRestore();
    });
});

// My notis test
describe("getMyNotifications", () => {
    it("returns 401 when no tenant ID is available", async () => {
        const res = createResponse();

        await getMyNotifications({}, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized: No tenant ID provided." });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("returns notifications for the authenticated tenant", async () => {
        const notifications = [{ notification_id: 1, tenant_id: 4, status: "unread" }];
        client.query.mockResolvedValueOnce({ rows: notifications });
        const res = createResponse();

        await getMyNotifications({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(notifications);
    });
});

//Read Notifications
describe("readNotifications", () => {
    it("returns 404 when the notification is missing or belongs to another tenant", async () => {
        client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
        const res = createResponse();

        await readNotifications({ tenantId: 4, params: { notificationId: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "Notification not found or not authorized." });
    });

    it("marks the tenant's notification as read", async () => {
        const notification = { notification_id: 1, tenant_id: 4, status: "read" };
        client.query.mockResolvedValueOnce({ rowCount: 1, rows: [notification] });
        const res = createResponse();

        await readNotifications({ tenantId: 4, params: { notificationId: 1 } }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [1, 4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(notification);
    });
});

// Read All notis
describe("readAllNotifications", () => {
    it("returns 404 when the tenant has no unread notifications", async () => {
        client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
        const res = createResponse();

        await readAllNotifications({ tenantId: 4 }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "No unread notifications found." });
    });

    it("marks every unread notification as read", async () => {
        const notifications = [{ notification_id: 1, status: "read" }, { notification_id: 2, status: "read" }];
        client.query.mockResolvedValueOnce({ rowCount: 2, rows: notifications });
        const res = createResponse();

        await readAllNotifications({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "2 notification(s) marked as read.",
            notifications,
        });
    });
});
