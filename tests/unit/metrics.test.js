const express = require("express");
const request = require("supertest");
const { trackHttpRequests, getMetrics } = require("../../controllers/metrics");

const app = express();
app.use(trackHttpRequests);
app.use(express.json());
for (const prefix of ["tenants", "rooms"]) {
  const router = express.Router();
  router.get("/:id", (req, res) => res.sendStatus(200));
  app.use(`/api/${prefix}`, router);
}
app.get("/prestige-hostel/v1/metrics", getMetrics);
app.use((err, req, res, next) => res.sendStatus(400));

test("exports runtime version and records bounded route labels and durations", async () => {
  await request(app).get("/api/tenants/123");
  await request(app).get("/api/tenants/456");
  await request(app).get("/api/rooms/789");
  await request(app).get("/missing/random-id");
  await request(app).post("/api/tenants").set("Content-Type", "application/json").send("{");
  await request(app).get("/prestige-hostel/v1/metrics");
  const response = await request(app).get("/prestige-hostel/v1/metrics");
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toContain("text/plain");
  expect(response.text).toContain(`nodejs_version_info{version="${process.version}"`);
  expect(response.text).toContain('http_requests_total{method="GET",route="/api/tenants/:id",status_code="200"} 2');
  expect(response.text).toContain('http_request_duration_seconds_count{method="GET",route="/api/rooms/:id",status_code="200"} 1');
  expect(response.text).toContain('http_requests_total{method="GET",route="unmatched",status_code="404"} 1');
  expect(response.text).toContain('http_requests_total{method="POST",route="unmatched",status_code="400"} 1');
  expect(response.text).not.toMatch(/route="[^"]*(123|456|789|random-id|metrics)/);
});
