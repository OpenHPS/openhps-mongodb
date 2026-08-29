/**
 * The MongoDB the suites connect to.
 *
 * The URL used to be hardcoded as `mongodb://mongo:27017`, which only resolves from
 * inside the docker-compose network in the repository's Dockerfile setup. CI runs the
 * tests on the runner with only the database in a container, so the default is the
 * published port on localhost. Set MONGO_URL to point somewhere else.
 */
export const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
