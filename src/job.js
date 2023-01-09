import { SuperAgent as superagent } from "superagent";
import settings from "../settings";
import { isValidDate, buildUrlWithParams, buildUrlWithQuery } from "./util";

const getCheckJobFormatFunction =
  (jobProperty, defaultJob = {}) =>
    (job) => {
      if (!job.name || (jobProperty && !job[jobProperty])) {
        throw new Error(
          `expected request body to match {name${jobProperty ? `, ${jobProperty}` : ""
          }}`
        );
      }

      return { ...defaultJob, ...job };
    };

const doNotCheck = (job) => job;

const getAssertFunction = (assertOnCount, errorOnName) => (job, jobs) =>
  jobs.countDocuments({ name: job.name }).then((count) => {
    if (!assertOnCount(count)) {
      throw new Error(errorOnName(job.name));
    }
  });

const jobAssertions = {
  alreadyExists: getAssertFunction(
    (count) => count > 0,
    (name) => `Did not find a job named "${name}"`
  ),
  notExists: getAssertFunction(
    (count) => count <= 0,
    (name) => `A job named "${name}" already exist`
  ),
  doNotAssert: () => true,
};

const defineJob = async (job, jobs, agenda) => {
  const { name, url, method, callback } = job;
  agenda.define(name, async (job, done) => {
    const {
      attrs: { data },
    } = job;
    let uri = buildUrlWithParams({ url, params: data.params });
    uri = buildUrlWithQuery({ url: uri, query: data.query });

    const options = {
      method: method || "post",
      uri,
      body: data.body,
      headers: data.headers || {}
    };

    // Error if no response in timeout
    try {
      result = await superagent[options.method](options.uri).send(options.body).set(options.headers)
      if (callback) {
        return await superagent[callback.method](callback.url).send({ data, response: result }).set(callback.headers);
      }
    } catch (error) {
      job.fail(`message: ${err.message}`);
      return { error: err.message };
    }
  });

  await jobs
    .countDocuments({ name })
    .then((count) =>
      count < 1 ? jobs.insertOne(job) : jobs.updateOne({ name }, { $set: job })
    );

  return "job defined";
};

const deleteJob = async (job, jobs, agenda) => {
  const numRemoved = await agenda.cancel(job);
  const obj = await jobs.deleteOne(job);
  return `removed ${obj.deletedCount} job definitions and ${numRemoved} job instances.`;
};

const cancelJob = async (job, jobs, agenda) => {
  const numRemoved = await agenda.cancel(job);
  return `${numRemoved} jobs canceled`;
};

const getDefaultJobForSchedule = () => ({
  data: {
    body: {},
    params: {},
    query: {},
  },
});

const pickValues = ({ obj, pickProps }) =>
  pickProps.reduce(
    (props, prop) => (obj[prop] ? [...props, obj[prop]] : props),
    []
  );

const scheduleTypes = {
  now: {
    fn: (agenda) => agenda.now.bind(agenda),
    message: "for now",
    getParams: (job) => pickValues({ obj: job, pickProps: ["name", "data"] }),
  },
  once: {
    fn: (agenda) => agenda.schedule.bind(agenda),
    message: "for once",
    getParams: (job) => {
      // Check if interval is date or timestamp
      let time = new Date(job.interval);
      time = isValidDate(time) ? time : job.interval;
      console.log(time);
      return pickValues({
        obj: { ...job, time },
        pickProps: ["time", "name", "data"],
      });
    },
  },
  every: {
    fn: (agenda) => agenda.everyNew.bind(agenda),
    message: "for repetition",
    getParams: (job) =>
      pickValues({
        obj: job,
        pickProps: ["interval", "name", "data", "options"],
      }),
  },
};

const getScheduleJobFunction = (scheduleType) => async (job, jobs, agenda) => {
  await scheduleType.fn(agenda)(...scheduleType.getParams(job));
  return `job scheduled ${scheduleType.message}`;
};

const getJobOperation = (checkFunction, jobFunction) => ({
  check: checkFunction,
  fn: jobFunction,
});

const jobOperations = {
  create: getJobOperation(getCheckJobFormatFunction("url"), defineJob),
  update: getJobOperation(getCheckJobFormatFunction(), defineJob),
  delete: getJobOperation(getCheckJobFormatFunction(), deleteJob),
  cancel: getJobOperation(doNotCheck, cancelJob),
  now: getJobOperation(
    getCheckJobFormatFunction(false, getDefaultJobForSchedule()),
    getScheduleJobFunction(scheduleTypes.now)
  ),
  once: getJobOperation(
    getCheckJobFormatFunction("interval", getDefaultJobForSchedule()),
    getScheduleJobFunction(scheduleTypes.once)
  ),
  every: getJobOperation(
    getCheckJobFormatFunction("interval", getDefaultJobForSchedule()),
    getScheduleJobFunction(scheduleTypes.every)
  ),
};

const promiseJobOperation = async (
  job,
  jobs,
  agenda,
  jobAssertion,
  jobOperation
) => {
  job = await jobOperation.check(job);
  await jobAssertion(job, jobs);
  return jobOperation.fn(job, jobs, agenda);
};

export { promiseJobOperation, jobOperations, jobAssertions, defineJob };
