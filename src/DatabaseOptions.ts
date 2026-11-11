import { DataServiceOptions } from '@openhps/core';
import { MongoClientOptions } from 'mongodb';
import { TimeSeriesOptions } from './TimeSeriesOptions';

/**
 * Database connection options
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
    /**
     * Store the data objects in a time-series collection instead of a regular collection
     */
    timeSeries?: TimeSeriesOptions;
}
