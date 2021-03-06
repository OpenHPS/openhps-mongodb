import { DataSerializer, DataServiceDriver, FilterQuery } from '@openhps/core';
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

    constructor(dataType: new () => T, options: DatabaseOptions) {
        super((dataType as unknown) as new () => T);
        this.options = options;
        this.options.collectionName = this.options.collectionName || this.name.toLowerCase();

        this.once('build', this.connect.bind(this));
        this.once('destroy', this.disconnect.bind(this));
    }

    public connect(): Promise<void> {
        if (this._client !== undefined) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            MongoClient.connect(
                this.options.dbURL,
                {
                    useUnifiedTopology: true,
                    useNewUrlParser: true,
                },
                (err: any, client: MongoClient) => {
                    if (err !== null) {
                        return reject(err);
                    }

                    this._client = client;
                    this._db = client.db(this.options.dbName);

                    this._collection = this._db.collection(this.options.collectionName);
                    resolve();
                },
            );
        });
    }

    public createIndex(index: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._collection.createIndex(index, (err: any) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    public disconnect(): Promise<void> {
        if (this._client === undefined) {
            return Promise.resolve();
        }
        return this._client.close();
    }

    public findByUID(id: I): Promise<T> {
        return this.findOne({ _id: id });
    }

    public findOne(query?: FilterQuery<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection
                .findOne(query)
                .then((serializedObject) => {
                    if (serializedObject === null) {
                        return reject(`${this.dataType.name} not found!`);
                    }
                    resolve(DataSerializer.deserialize(serializedObject, this.dataType as any));
                })
                .catch(reject);
        });
    }

    public findAll(query?: FilterQuery<T>): Promise<T[]> {
        return new Promise<T[]>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection.find(query).toArray((err: any, result: any) => {
                if (err !== null) {
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

    public insert(id: I, object: T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection
                .findOne({ _id: id })
                .then((existingObject) => {
                    const preparedObject = DataSerializer.serialize(object);
                    preparedObject._id = id;
                    if (existingObject === null) {
                        this._collection.insertOne(preparedObject, () => {
                            // Ignore insert error - possible race condition
                            resolve(object);
                        });
                    } else {
                        this._collection.updateOne({ _id: id }, { $set: preparedObject }, (err: any) => {
                            if (err !== null) {
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

    public delete(id: I): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection
                .deleteOne({ _id: id })
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    public deleteAll(query?: FilterQuery<T>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection
                .deleteMany(query)
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }
}
