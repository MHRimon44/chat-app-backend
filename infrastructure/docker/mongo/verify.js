const expectedReplicaSet = 'rs0';
const appDatabaseName = process.env.MONGO_APP_DATABASE;
const appUsername = process.env.MONGO_APP_USERNAME;

const ping = db.adminCommand({ ping: 1 });
const hello = db.hello();
const status = rs.status();
const appUser = db.getSiblingDB(appDatabaseName).getUser(appUsername);

if (ping.ok !== 1) {
  throw new Error('MongoDB ping failed.');
}

if (status.set !== expectedReplicaSet || !hello.isWritablePrimary) {
  throw new Error('MongoDB replica set is not writable and healthy.');
}

if (!appUser) {
  throw new Error('MongoDB application user is missing.');
}

printjson({
  appUserReady: true,
  isWritablePrimary: hello.isWritablePrimary,
  replicaSet: status.set,
});
