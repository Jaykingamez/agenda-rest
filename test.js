const { promisify } = require("util");
const request = require("supertest");
const expect = require("assert");
const {
  bootstrapKoaApp,
  oncePerKey,
  AsyncCounter,
  buildUrlWithParams,
  buildUrlWithQuery,
} = require("./src/util");
const { app, jobsReady } = require("./src");

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
    .delete(`/api/job/${jobName}`)
    .send();
}

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
      expect(res.status, 200)
    });

    describe("POST /api/job/now", () => {
      it(`Testing with existing job definition`, async () => {
        const res = await agendaAppRequest
          .post("/api/job/now")
          .send({ name: "foo" });
        expect(res.status, 200);
        expect(res.text, "job scheduled for now");
      })
    })

    describe("POST /api/job/now", () => {
      it(`Testing with existing job definition`, async () => {
        const res = await agendaAppRequest
          .post("/api/job/every")
          .send({ name: "foo", interval: "2 seconds" });
        expect(res.text, "job scheduled for repetition");
      })
    })

    describe("POST /api/job/once", () => {
      it(`Testing with existing job definition`, async () => {
        const res = await agendaAppRequest
          .post("/api/job/once")
          .send({ name: "foo", interval: new Date().getTime() + 10000 });
        // .send({name: 'foo', interval: 'in 10 seconds'});
        expect(res.status, 200);
        expect(res.text, "job scheduled for once");
      })
    })

    describe("DELETE /api/job", () => {
      it(`Testing delete job`, async () => {
        const res = await agendaAppRequest.delete("/api/job/foo");
        expect(res.status, 200);
      })
    })

    describe(`Testing buildUrl`, () => {
      it("Build URL with parameters.", () => {
        expect(
          buildUrlWithParams({
            url: "http://example.com:8888/foo/:param1/:param2",
            params: { param1: "value1", param2: "value2" },
          }),
          "http://example.com:8888/foo/value1/value2"
        );
      });

      it("Build URL with query.", () => {
        expect(
          buildUrlWithQuery({
            url: "http://example.com/foo",
            query: { query1: "value1", query2: "value2" },
          }),
          "http://example.com/foo?query1=value1&query2=value2"
        );
      });
    })

  })
})

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






