// Visitor flows are database-backed; no real clock or database is needed here.
jest.mock("../../config/db", () => ({ query: jest.fn() }));

const client = require("../../config/db");
const { getVisitors, signInVisitor, signOutVisitor, myVisitor } = require("../../controllers/visitors");

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

// The controller combines time-only input with today's date, so tests do the same.
const sameDayTime = (time) => `${new Date().toLocaleDateString("en-CA")}T${time}:00`;

beforeEach(() => {
    jest.clearAllMocks();
});

// SignIn visitor test
describe("signInVisitor", () => {
    it("requires visitor details before querying the database", async () => {
        const res = createResponse();

        await signInVisitor({ body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Name, phone number, planned exit time, and visited room are required.",
        });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("registers a visitor for an occupied room", async () => {
        const visitor = { visitorid: 1, name: "Mary", is_active: true };
        // Room lookup, duplicate active-visit check, then visitor insert.
        client.query
            .mockResolvedValueOnce({ rows: [{ roomid: 2, status: "Occupied" }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [visitor] });
        const res = createResponse();

        await signInVisitor({
            body: {
                name: "Mary",
                phoneNumber: "0712345678",
                visitedRoomId: 2,
                entryTime: sameDayTime("10:00"),
                plannedExitTime: "18:00",
            },
        }, res);

        expect(client.query).toHaveBeenCalledTimes(3);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: "Visitor entry registered successfully.", visitor });
    });
});

// Visitor signouts test
describe("signOutVisitor", () => {
    it("requires a phone number and actual exit time", async () => {
        const res = createResponse();

        await signOutVisitor({ body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "Phone number and actual exit time are required to sign out." });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("signs out an active visitor within the planned visit time", async () => {
        client.query
            .mockResolvedValueOnce({ rows: [{ visitorid: 1, entrytime: sameDayTime("10:00"), plannedexittime: sameDayTime("18:00") }] })
            .mockResolvedValueOnce({ rows: [{ visitorid: 1, is_active: false }] });
        const res = createResponse();

        await signOutVisitor({ body: { phoneNumber: "0712345678", actualExitTime: "17:00" } }, res);

        expect(client.query).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Visitor signed out successfully." });
    });
});

// All visitors test
describe("getVisitors", () => {
    it("returns all visitors", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation();
        const visitors = [{ visitorid: 1, name: "Mary" }];
        client.query.mockResolvedValueOnce({ rows: visitors });
        const res = createResponse();

        await getVisitors({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(visitors);
        logSpy.mockRestore();
    });

    it("returns 500 when visitors cannot be fetched", async () => {
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getVisitors({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ mesage: "Could not fetch rooms." });
    });
});

// My Visitor test
describe("myVisitor", () => {
    it("returns 404 when the tenant has no booked room", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await myVisitor({ tenantId: 4 }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "No room found for this tenant." });
    });

    it("returns active visitors for the tenant's booked rooms", async () => {
        const visitors = [{ visitorid: 1, visitedroomid: 2, is_active: true }];
        client.query
            .mockResolvedValueOnce({ rows: [{ room_id: 2 }, { room_id: 3 }] })
            .mockResolvedValueOnce({ rows: visitors });
        const res = createResponse();

        await myVisitor({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenLastCalledWith(expect.any(String), [[2, 3]]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ visitors });
    });
});
