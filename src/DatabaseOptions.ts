import { DataServiceOptions } from '@openhps/core';
import { MongoClientOptions } from 'mongodb';

/**
 * Database connection options
 *
 * @category Service
 */
export interface DatabaseOptions extends MongoClientOptions, DataServiceOptions {
    /**
     * Database URL
     */
    dbURL: string;
    /**
     * Database name
     */
    dbName: string;
    /**
     * Collection name
     */
    collectionName?: string;
}
