import {
    DataSerializer,
    DataServiceDriver,
    FilterQuery,
    FindOptions,
    Constructor,
    DataSerializerUtils,
} from '@openhps/core';
import { MongoClient, Db, Collection } from 'mongodb';
import { DatabaseOptions } from './DatabaseOptions';
import { TimeSeriesGranularity } from './TimeSeriesOptions';

/**
 * Data service driver for MongoDB
 *
 * ### Usage
 * You can use a ```MongoDataServiceDriver``` in a data service such as a ```DataObjectService``` to
 * use the driver to store data objects of a specific type.
 *
 * ```typescript
 * import { ModelBuilder, DataObjectService, DataObject, ReferenceSpace } from '@openhps/core';
 * import { MongoDataServiceDriver } from '@openhps/mongodb';
 *
 * ModelBuilder.create()
 * .addService(new DataObjectService(new MongoDataServiceDriver(DataObject, {
 * dbURL: "mongodb://mongo:27017",
 * dbName: "myobjects"
 * })))
 * .addService(new DataObjectService(new MongoDataServiceDriver(ReferenceSpace, {
 * dbURL: "mongodb://mongo:27017",
 * dbName: "myspaces"
 * })))
 * .addShape(\/* ... *\/)
 * .build().then(model => {
 * \/* ... *\/
 * });
 * ```
 *
 * Passing a ```timeSeries``` option stores the objects in a
 * [time-series collection](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
 * instead. Such collections are append-only: every insert adds a sample, even when the same
 * identifier is inserted again, and unique member indexes are rejected.
 * @category Service
 */
export class MongoDataServiceDriver<I, T> extends DataServiceDriver<I, T> {
    protected options: DatabaseOptions;
    private _db: Db;
    private _client: MongoClient;
    private _collection: Collection<any>;
    private _timeSeries: {
        timeField: string;
        metaField: string;
        metaFields: string[];
        granularity?: TimeSeriesGranularity;
        expireAfterSeconds?: number;
        indexes?: Record<string, 1 | -1>[];
    };

    constructor(dataType: Constructor<T>, options: DatabaseOptions) {
        super(dataType);
        this.options = options;
        this.options.collectionName = this.options.collectionName || this.uid.toLowerCase();
        if (this.options.timeSeries) {
            this._timeSeries = {
                timeField: this.options.timeSeries.timeField ?? 'time',
                metaField: this.options.timeSeries.metaField ?? 'meta',
                metaFields: this.options.timeSeries.metaFields ?? ['uid'],
                granularity: this.options.timeSeries.granularity,
                expireAfterSeconds: this.options.timeSeries.expireAfterSeconds,
                indexes: this.options.timeSeries.indexes,
            };
        }

        this.once('build', this.connect.bind(this));
        this.once('destroy', this.disconnect.bind(this));
    }

    /**
     * Connect to the MongoDB service
     *
     * When time-series options are configured, the collection is created with its time-series
     * layout and indexes before it is used.
     * @returns {Promise<void>} Promise of connection
     */
    async connect(): Promise<void> {
        if (this._client !== undefined) {
            return;
        }
        const client = await MongoClient.connect(this.options.dbURL, {
            auth: this.options.auth,
        });
        this._client = client;
        this._db = client.db(this.options.dbName);
        await this._createTimeSeriesCollection();
        this._collection = this._db.collection(this.options.collectionName);
        if (this._timeSeries) {
            await this._createTimeSeriesIndexes();
        }
        const indexes: Array<Promise<void>> = Array.from(
            DataSerializerUtils.getRootMetadata(this.dataType).dataMembers.values(),
        )
            .filter((dataMember: any) => dataMember.index)
            .map(this.createIndex.bind(this));
        await Promise.all(indexes);
    }

    /**
     * Create the collection as a time-series collection when it does not exist yet
     * @returns {Promise<void>} Promise of collection creation
     */
    private async _createTimeSeriesCollection(): Promise<void> {
        if (this._timeSeries === undefined) {
            return;
        }
        const existing = await this._db
            .listCollections({ name: this.options.collectionName }, { nameOnly: true })
            .toArray();
        if (existing.length > 0) {
            return;
        }
        try {
            await this._db.createCollection(this.options.collectionName, {
                timeseries: {
                    timeField: this._timeSeries.timeField,
                    metaField: this._timeSeries.metaField,
                    ...(this._timeSeries.granularity ? { granularity: this._timeSeries.granularity } : {}),
                },
                ...(this._timeSeries.expireAfterSeconds
                    ? { expireAfterSeconds: this._timeSeries.expireAfterSeconds }
                    : {}),
            });
        } catch (ex) {
            // Two services may create the same collection at the same time.
            if (ex.code !== 48) {
                throw ex;
            }
        }
    }

    /**
     * Create the secondary indexes of the time-series collection
     * @returns {Promise<void>} Promise of index creation
     */
    private async _createTimeSeriesIndexes(): Promise<void> {
        const { timeField, metaField, metaFields, indexes } = this._timeSeries;
        const specifications: Record<string, 1 | -1>[] =
            indexes ?? (metaFields.length > 0 ? [{ [`${metaField}.${metaFields[0]}`]: 1, [timeField]: -1 }] : []);
        for (const specification of specifications) {
            await this._collection.createIndex(specification);
        }
    }

    /**
     * Write the time and metadata members of a time-series document
     *
     * The metadata is copied from the serialized document so it matches what is stored, and the
     * time member is a BSON date because MongoDB requires it.
     * @param {any} document Serialized data object
     * @param {T} object Data object that is being stored
     */
    private _prepareTimeSeriesDocument(document: any, object: T): void {
        const { timeField, metaField, metaFields } = this._timeSeries;
        if (!(document[timeField] instanceof Date)) {
            const createdTimestamp = (object as any).createdTimestamp;
            document[timeField] = new Date(typeof createdTimestamp === 'number' ? createdTimestamp : Date.now());
        }
        if (metaFields.length > 0) {
            document[metaField] = metaFields.reduce((meta: any, member: string) => {
                if (document[member] !== undefined) {
                    meta[member] = document[member];
                }
                return meta;
            }, {});
        }
    }

    /**
     * Create a new index
     * @param {any} dataMember Data member to create index for
     * @returns {Promise<void>} Index created promise
     */
    createIndex(dataMember: any): Promise<void> {
        if (this._timeSeries && dataMember.unique) {
            return Promise.reject(
                new Error(
                    `Unique index on member #${dataMember.key} is not supported on the time-series collection #${this.options.collectionName}`,
                ),
            );
        }
        return new Promise((resolve, reject) => {
            this._collection
                .createIndex(dataMember.key, {
                    unique: dataMember.unique ? true : false,
                })
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Disconnect from the MongoDB database
     * @returns {Promise<void>} Promise of disconnect
     */
    disconnect(): Promise<void> {
        if (this._client === undefined) {
            return Promise.resolve();
        }
        return this._client.close();
    }

    findByUID(id: I): Promise<T> {
        return new Promise((resolve, reject) => {
            this.findOne({ _id: id })
                .then((object) => {
                    if (object === undefined) {
                        return reject(`${this.dataType.name} with identifier #${id} not found!`);
                    }
                    resolve(object);
                })
                .catch(reject);
        });
    }

    findOne(query?: FilterQuery<T>, options?: FindOptions): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            this._collection
                .findOne(query, options)
                .then((serializedObject) => {
                    if (!serializedObject) {
                        return resolve(undefined);
                    }
                    resolve(DataSerializer.deserialize(serializedObject, this.dataType as any));
                })
                .catch(reject);
        });
    }

    findAll(query?: FilterQuery<T>, options?: FindOptions): Promise<T[]> {
        return new Promise<T[]>((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            this._collection
                .find(query, options)
                .toArray()
                .then((result: any) => {
                    const deserializedResults: any[] = [];
                    result.forEach((r: any) => {
                        deserializedResults.push(DataSerializer.deserialize(r, this.dataType as any));
                    });
                    resolve(deserializedResults);
                })
                .catch(reject);
        });
    }

    insert(id: I, object: T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            const preparedObject = DataSerializer.serialize(object);
            preparedObject._id = id;
            if (this._timeSeries) {
                // Time-series collections do not support upserts or single-document updates, so
                // every insert is appended as a new sample.
                this._prepareTimeSeriesDocument(preparedObject, object);
                this._collection
                    .insertOne(preparedObject)
                    .then(() => {
                        resolve(object);
                    })
                    .catch(reject);
                return;
            }
            this._collection
                .findOne({ _id: id })
                .then((existingObject) => {
                    if (!existingObject) {
                        this._collection
                            .insertOne(preparedObject)
                            .then(() => {
                                resolve(object);
                            })
                            .catch(() => {
                                // Ignore insert error - possible race condition
                                resolve(object);
                            });
                    } else {
                        this._collection
                            .updateOne({ _id: id }, { $set: preparedObject })
                            .then(() => {
                                resolve(object);
                            })
                            .catch(reject);
                    }
                })
                .catch((ex) => {
                    reject(ex);
                });
        });
    }

    count(query?: FilterQuery<T>): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            this._collection.count(query).then(resolve).catch(reject);
        });
    }

    delete(id: I): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            // Every document sharing the identifier is a sample of the same data object.
            const deletion = this._timeSeries
                ? this._collection.deleteMany({ _id: id })
                : this._collection.deleteOne({ _id: id });
            deletion
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    deleteAll(query?: FilterQuery<T>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._checkIfReady(reject)) {
                return;
            }
            this._collection
                .deleteMany(query)
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    private _checkIfReady(reject: (reason: any) => void): boolean {
        if (this._collection === undefined) {
            reject(
                new Error(`MongoDB connection not ready! Most likely the service was accessed before
                the connection was completed.`),
            );
            return false;
        }
        return true;
    }
}
