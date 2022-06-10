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
 *     .addService(new DataObjectService(new MongoDataServiceDriver(DataObject, {
 *         dbURL: "mongodb://mongo:27017",
 *         dbName: "myobjects"
 *     })))
 *     .addService(new DataObjectService(new MongoDataServiceDriver(ReferenceSpace, {
 *         dbURL: "mongodb://mongo:27017",
 *         dbName: "myspaces"
 *     })))
 *     .addShape(\/* ... *\/)
 *     .build().then(model => {
 *         \/* ... *\/
 *     });
 * ```
 *
 * @category Service
 */
export class MongoDataServiceDriver<I, T> extends DataServiceDriver<I, T> {
    protected options: DatabaseOptions;
    private _db: Db;
    private _client: MongoClient;
    private _collection: Collection<any>;

    constructor(dataType: Constructor<T>, options: DatabaseOptions) {
        super(dataType);
        this.options = options;
        this.options.collectionName = this.options.collectionName || this.uid.toLowerCase();

        this.once('build', this.connect.bind(this));
        this.once('destroy', this.disconnect.bind(this));
    }

    /**
     * Connect to the MongoDB service
     *
     * @returns {Promise<void>} Promise of connection
     */
    connect(): Promise<void> {
        if (this._client !== undefined) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            MongoClient.connect(
                this.options.dbURL,
                {
                    auth: this.options.auth,
                },
                (err: any, client: MongoClient) => {
                    if (err) {
                        return reject(err);
                    }

                    this._client = client;
                    this._db = client.db(this.options.dbName);

                    this._collection = this._db.collection(this.options.collectionName);
                    const indexes: Array<Promise<void>> = Array.from(
                        DataSerializerUtils.getRootMetadata(this.dataType).dataMembers.values(),
                    )
                        .filter((dataMember: any) => dataMember.index)
                        .map(this.createIndex.bind(this));
                    Promise.all(indexes)
                        .then(() => resolve())
                        .catch(reject);
                },
            );
        });
    }

    /**
     * Create a new index
     *
     * @param {any} dataMember Data member to create index for
     * @returns {Promise<void>} Index created promise
     */
    createIndex(dataMember: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this._collection.createIndex(
                dataMember.key,
                {
                    unique: dataMember.unique ? true : false,
                },
                (err: any) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                },
            );
        });
    }

    /**
     * Disconnect from the MongoDB database
     *
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
            this._checkIfReady(reject);
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
            this._checkIfReady(reject);
            this._collection.find(query, options).toArray((err: any, result: any) => {
                if (err) {
                    return reject(err);
                }
                const deserializedResults: any[] = [];
                result.forEach((r: any) => {
                    deserializedResults.push(DataSerializer.deserialize(r, this.dataType as any));
                });
                resolve(deserializedResults);
            });
        });
    }

    insert(id: I, object: T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this._checkIfReady(reject);
            this._collection
                .findOne({ _id: id })
                .then((existingObject) => {
                    const preparedObject = DataSerializer.serialize(object);
                    preparedObject._id = id;
                    if (!existingObject) {
                        this._collection.insertOne(preparedObject, () => {
                            // Ignore insert error - possible race condition
                            resolve(object);
                        });
                    } else {
                        this._collection.updateOne({ _id: id }, { $set: preparedObject }, (err: any) => {
                            if (err) {
                                return reject(err);
                            }
                            resolve(object);
                        });
                    }
                })
                .catch((ex) => {
                    reject(ex);
                });
        });
    }

    count(query?: FilterQuery<T>): Promise<number> {
        return new Promise((resolve, reject) => {
            this._checkIfReady(reject);
            this._collection.count(query).then(resolve).catch(reject);
        });
    }

    delete(id: I): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._checkIfReady(reject);
            this._collection
                .deleteOne({ _id: id })
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    deleteAll(query?: FilterQuery<T>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._checkIfReady(reject);
            this._collection
                .deleteMany(query)
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    private _checkIfReady(reject: (reason: any) => void): void {
        if (this._collection === undefined) {
            return reject(
                new Error(`MongoDB connection not ready! Most likely the service was accessed before
                the connection was completed.`),
            );
        }
    }
}
