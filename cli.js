#!/usr/bin/env node
const program = require('commander');
const settings = require('./settings');
const { app, agenda } = require('./src');

program
  .option("-u, --dburi <dburi>", "[optional] Full Mongo connection string")
  .option("-d, --dbname <dbname>", "[optional] Name of the Mongo database")
  .option("-h, --dbhost <dbhost>", "[optional] Mongo instance's IP")
  .option(
    "-p, --port <port>",
    "[optional] Server port, default 4040",
    (n, d) => Number(n) || d,
    4040
  )
  .option("-c, --cors <cors>", "[optional] Allowed origin for requests")
  .option("-k, --key <key>", "[optional] X-API-KEY to be expected in headers")
  .option(
    "-t, --timeout <timeout>",
    "[optional] Timeout for request duration",
    (n, d) => Number(n) || d,
    5000
  )
  .option(
    "-a, --agenda_settings <agenda_settings>",
    "[optional] A JSON string containing additional agenda settings."
  )
  .parse(process.argv);

const options = program.opts();

settings.dburi = options.dburi || settings.dburi;
settings.dbname = options.dbname || settings.dbname;
settings.dbhost = options.dbhost || settings.dbhost;
settings.appId = options.key || settings.appId;
settings.timeout = options.timeout || settings.timeout;
settings.cors = options.cors || settings.cors;

if (options.agenda_settings) {
  settings.agenda = JSON.parse(options.agenda_settings);
}

const server = app.listen(options.port, () => {
  console.log(`App listening on port ${options.port}.`);
});

async function graceful() {
  console.log("\nClosing server...");
  await server.close();
  console.log("Shutting down gracefully...");
  await agenda.stop();
  process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);
