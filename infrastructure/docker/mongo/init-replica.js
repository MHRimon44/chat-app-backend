const replicaSetName = 'rs0';
const mongoHost = 'mongo:27017';
const appDatabaseName = process.env.MONGO_APP_DATABASE;
const appUsername = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appDatabaseName || !appUsername || !appPassword) {
  throw new Error('MongoDB application user configuration is incomplete.');
}

try {
  rs.status();
} catch (error) {
  if (error.codeName !== 'NotYetInitialized' && error.code !== 94) {
    throw error;
  }

  rs.initiate({
    _id: replicaSetName,
    members: [{ _id: 0, host: mongoHost }],
  });
}

const primaryDeadline = Date.now() + 60_000;

while (!db.hello().isWritablePrimary) {
  if (Date.now() >= primaryDeadline) {
    throw new Error('MongoDB replica set did not elect a primary before timeout.');
  }

  sleep(500);
}

const appDatabase = db.getSiblingDB(appDatabaseName);
const existingUser = appDatabase.getUser(appUsername);

if (!existingUser) {
  appDatabase.createUser({
    user: appUsername,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: appDatabaseName }],
  });
}

print(`MongoDB replica set '${replicaSetName}' and application user are ready.`);
