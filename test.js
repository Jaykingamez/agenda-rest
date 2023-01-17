import { promisify } from "util";
import request from "supertest";
import { expect } from "assert";
import {
  bootstrapKoaApp,
  oncePerKey,
  AsyncCounter,
  buildUrlWithParams,
  buildUrlWithQuery,
} from "./src/util";
import { app, jobsReady } from "./src";

const agendaAppUrl = "http://localhost:4041";
const testAppUrl = "http://localhost:4042";
const jobName = "foo";
const nonExistentJobName = "fooWrong";
const { app: testApp, router: testAppRouter } = bootstrapKoaApp();
const getTestAppUrl = (path) => (path ? `${testAppUrl}${path}` : testAppUrl);

const agendaAppRequest = request(agendaAppUrl);

const bootstrapApp = async () => {
  await promisify(app.listen)
    .bind(app)(4041)
    .then(() => console.log("agenda-rest app running"));

  await promisify(testApp.listen)
    .bind(testApp)(4042)
    .then(() => console.log("test app running"));
  await jobsReady;
};

const removeTestData = async () => {
  // Delete Job
  await agendaAppRequest
    .post(`/api/job/${jobName}`)
    .send();
}

describe("Testing agenda-rest", () => {
  before(async () => {
    await bootstrapApp();
    await removeTestData();
  })

  describe("POST /api/job", () => {
    it(`Testing request without content`, async () => {
      const res = await agendaAppRequest.post("/api/job").send();
      expect(res.status, 400);
    })

    it(`Testing request with specified job`, async () => {
      const res = await agendaAppRequest
        .post("/api/job")
        .send({ name: jobName, url: getTestAppUrl() });

      expect(res.status, 200);
    })
  })

  describe("PUT /api/job", () => {
    it(`Testing request when job does not exist`, async () => {
      const res = await agendaAppRequest
        .put(`/api/job/${nonExistentJobName}`)
        .send({ url: getTestAppUrl() });
      expect(res.status, 400);
    })

    it(`Testing request when job exists`, async () => {
      const res = await agendaAppRequest
        .put(`/api/job/${jobName}`)
        .send({ url: getTestAppUrl() })
    });
    expect(res.status, 200)
  })
})

const fooProps = {};

const defineFooEndpoint = (
  route,
  message,
  countTimes = 1,
  statusCode = 200
) => {
  const counter = new AsyncCounter(countTimes);
  fooProps.counter = counter;
  fooProps.message = message;
  fooProps.statusCode = statusCode;

  const define = oncePerKey(route, () =>
    testAppRouter.post(route, async (ctx, next) => {
      ctx.body = fooProps.message;
      ctx.status = fooProps.statusCode;
      console.log(
        `${fooProps.message}! ${await fooProps.counter.count()} of ${fooProps.counter.countTimes
        }`
      );
      await next();
    })
  );
  define();
  return counter;
};

/* TODO
testAppRouter.post('/foo/:fooParam', async (ctx, next) => {
  console.log('foo with params invoked!');
  console.log(ctx.params);
  console.log(ctx.request.body);
  ctx.body = 'foo with params success';
  ctx.status = 200;
  await next();
});
testAppRouter.post('/foo/cb', async (ctx, next) => {
  console.log('foo callback invoked!');
  ctx.body = 'foo callback success';
  ctx.status = 200;
  await next();
});
*/

test.serial(
  "POST /api/job/now with existing foo definition invokes the foo endpoint",
  async (t) => {
    const counter = defineFooEndpoint("/foo", "foo now invoked");
    const res = await agendaAppRequest
      .post("/api/job/now")
      .send({ name: "foo" });

    t.is(res.text, "job scheduled for now");

    await counter.finished;
  }
);

test.serial(
  "POST /api/job/every with existing foo definition invokes the foo endpoint",
  async (t) => {
    const counter = defineFooEndpoint("/foo", "foo every invoked", 3);
    const res = await agendaAppRequest
      .post("/api/job/every")
      .send({ name: "foo", interval: "2 seconds" });

    t.is(res.text, "job scheduled for repetition");

    await counter.finished;
  }
);

test.serial(
  "POST /api/job/once with existing foo definition invokes the foo endpoint",
  async (t) => {
    const counter = defineFooEndpoint("/foo", "foo once invoked");
    const res = await agendaAppRequest
      .post("/api/job/once")
      .send({ name: "foo", interval: new Date().getTime() + 10000 });
    // .send({name: 'foo', interval: 'in 10 seconds'});

    t.is(res.text, "job scheduled for once");

    await counter.finished;
  }
);

test.serial("DELETE /api/job succeeds when a job is defined", async (t) => {
  const res = await agendaAppRequest.delete("/api/job/foo");

  t.is(res.status, 200);
});

test("GET /health returns 200 OK", async (t) => {
  const res = await agendaAppRequest.get("/health");

  t.is(res.status, 200);
});

test("Build URL with parameters.", (t) => {
  t.is(
    buildUrlWithParams({
      url: "http://example.com:8888/foo/:param1/:param2",
      params: { param1: "value1", param2: "value2" },
    }),
    "http://example.com:8888/foo/value1/value2"
  );
});

test("Build URL with query.", (t) => {
  t.is(
    buildUrlWithQuery({
      url: "http://example.com/foo",
      query: { query1: "value1", query2: "value2" },
    }),
    "http://example.com/foo?query1=value1&query2=value2"
  );
})