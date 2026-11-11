/**
 * Granularity hint for a MongoDB time-series bucket
 * @category Service
 */
export type TimeSeriesGranularity = 'seconds' | 'minutes' | 'hours';

/**
 * Time-series collection options
 *
 * Setting these options on a ```MongoDataServiceDriver``` stores the data objects in a MongoDB
 * [time-series collection](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
 * instead of a regular collection. Time-series collections bucket documents by time and compress
 * the buckets, which is what makes high-frequency, append-only data such as positioning samples
 * affordable to store.
 *
 * MongoDB does not support unique indexes or single-document updates on time-series collections.
 * The driver therefore creates the collection without unique member indexes and appends every
 * insert instead of updating the existing document with the same identifier. The driver writes
 * the time and metadata members itself, so a data object does not need to declare them.
 *
 * ### Usage
 * ```typescript
 * ModelBuilder.create()
 * .addService(new DataObjectService(new MongoDataServiceDriver(DataObject, {
 * dbURL: "mongodb://mongo:27017",
 * dbName: "positioning",
 * collectionName: "positions",
 * timeSeries: {
 *     timeField: "time",
 *     metaField: "meta",
 *     metaFields: ["uid"],
 *     granularity: "seconds",
 *     expireAfterSeconds: 7 * 24 * 60 * 60,
 * }
 * })))
 * .addShape(\/* ... *\/)
 * .build().then(model => {
 * \/* ... *\/
 * });
 * ```
 * @category Service
 */
export interface TimeSeriesOptions {
    /**
     * Document member holding the observation date (default ```time```).
     *
     * MongoDB requires this member to be a BSON ```Date```. The driver writes a date taken from
     * the data object's ```createdTimestamp``` (or the current date when the object has none)
     * unless the serialized object already contains a ```Date``` in this member.
     */
    timeField?: string;
    /**
     * Document member holding the bucket metadata (default ```meta```).
     */
    metaField?: string;
    /**
     * Data object members copied into the metadata document (default ```["uid"]```). The first
     * member is used in the default compound index.
     */
    metaFields?: string[];
    /**
     * Bucket granularity hint (default MongoDB's own bucketing).
     */
    granularity?: TimeSeriesGranularity;
    /**
     * Automatic expiration of documents in seconds. When omitted, documents are kept.
     */
    expireAfterSeconds?: number;
    /**
     * Secondary indexes to create on the collection.
     *
     * Defaults to a compound index on the first metadata member (ascending) and the time member
     * (descending), which is the access pattern of a per-object history query. Set an explicit
     * list to override it, or an empty array to create no secondary index.
     */
    indexes?: Record<string, 1 | -1>[];
}
