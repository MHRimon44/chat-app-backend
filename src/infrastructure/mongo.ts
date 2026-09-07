import mongoose from 'mongoose';
import type { Logger } from 'pino';

import type { ApiConfig } from '../config/env.js';

export interface MongoConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<void>;
}

export function createMongoConnection(
  config: Pick<ApiConfig, 'mongoMaxPoolSize' | 'mongoServerSelectionTimeoutMs' | 'mongoUri'>,
  logger: Logger,
): MongoConnection {
  return {
    async connect() {
      mongoose.set('bufferCommands', false);
      await mongoose.connect(config.mongoUri, {
        autoIndex: false,
        maxPoolSize: config.mongoMaxPoolSize,
        serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
      });
      logger.info('MongoDB connection established');
    },
    async disconnect() {
      if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
        await mongoose.disconnect();
        logger.info('MongoDB connection closed');
      }
    },
    async ping() {
      if (
        mongoose.connection.readyState !== mongoose.ConnectionStates.connected ||
        !mongoose.connection.db
      ) {
        throw new Error('MongoDB is not connected.');
      }

      await mongoose.connection.db.admin().ping();
    },
  };
}
