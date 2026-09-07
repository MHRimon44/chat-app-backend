const session = db.getMongo().startSession();
const sessionDatabase = session.getDatabase(process.env.MONGO_APP_DATABASE);
const collection = sessionDatabase.getCollection('__infrastructure_verification');
const verificationId = new ObjectId();

try {
  session.startTransaction();
  collection.insertOne({ _id: verificationId, createdAt: new Date() });
  session.commitTransaction();

  if (!collection.findOne({ _id: verificationId })) {
    throw new Error('Committed verification document was not found.');
  }

  collection.deleteOne({ _id: verificationId });
  printjson({ transactionReady: true });
} catch (error) {
  if (session.inTransaction()) {
    session.abortTransaction();
  }

  throw error;
} finally {
  session.endSession();
}
