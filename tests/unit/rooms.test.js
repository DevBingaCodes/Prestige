// Room controllers only depend on Postgres, so one query mock covers every path here.
jest.mock("../../config/db", () => ({ query: jest.fn() }));

const client = require("../../config/db");
const { getRooms, createARoom, updateRoom, deleteRoom } = require("../../controllers/rooms");

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Fetch rooms test
describe("getRooms", () => {
    it("returns active rooms filtered by status", async () => {
        const rooms = [{ roomid: 1, roomtype: "Single", status: "Available" }];
        client.query.mockResolvedValueOnce({ rows: rooms });
        const res = createResponse();

        await getRooms({ query: { status: "Available" } }, res);

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = $1"), ["Available"]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(rooms);
    });

    it("returns 500 when fetching rooms fails", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation();
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getRooms({ query: {} }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Could not fetch rooms." });
        errorSpy.mockRestore();
    });
});

// New room test
describe("createARoom", () => {
    it("requires the room type, price, and number of beds", async () => {
        const res = createResponse();

        await createARoom({ body: { room_type: "Single" } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "All fields are required." });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("creates an available room with its uploaded image", async () => {
        client.query.mockResolvedValueOnce({});
        const res = createResponse();

        await createARoom({
            body: { room_type: "Single", price: 5000, beds: 1 },
            file: { location: "https://example.com/room.jpg" },
        }, res);

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO rooms"), [
            "Single", "Available", 5000, 1, "https://example.com/room.jpg",
        ]);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: "Room created successfully" });
    });
});

// Update room test
describe("updateRoom", () => {
    it("rejects fields that are not valid room columns", async () => {
        const res = createResponse();

        await updateRoom({ params: { id: 1 }, body: { tenant_id: 4 } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "Invalid field: tenant_id" });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("updates allowed room fields", async () => {
        // The controller builds its UPDATE clause from the supplied allowed fields.
        client.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ roomid: 1, price: 6000 }] });
        const res = createResponse();

        await updateRoom({ params: { id: 1 }, body: { price: 6000 } }, res);

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("price = $1"), [6000, 1]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Room updated successfully" });
    });
});

// Soft delete room
describe("deleteRoom", () => {
    it("does not delete a room that is unavailable, occupied, or pending", async () => {
        client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
        const res = createResponse();

        await deleteRoom({ params: { id: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Room cannot be deleted. It may be occupied, pending, or already deleted.",
        });
    });

    it("soft deletes an available room", async () => {
        const room = { roomid: 1, status: "Unavailable" };
        client.query.mockResolvedValueOnce({ rowCount: 1, rows: [room] });
        const res = createResponse();

        await deleteRoom({ params: { id: 1 } }, res);

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("deleted_at = NOW()"), [1]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Room deleted successfully", room });
    });
});
