import { DataSerializer, DataService, FilterQuery } from '@openhps/core';
import { MongoClient, Db, Collection } from 'mongodb';
import { DatabaseOptions } from './DatabaseOptions';

export class MongoDataService<I, T> extends DataService<I, T> {
    private _options: DatabaseOptions;
    private _db: Db;
    private _client: MongoClient;
    private _collection: Collection<any>;

    constructor(dataType: new () => T, options: DatabaseOptions) {
        super(dataType as unknown as new () => T);
        this._options = options;

        this.once("build", this.connect.bind(this));
        this.once("destroy", this.disconnect.bind(this));
    }

    public connect(): Promise<void> {
        if (this._client !== undefined) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            MongoClient.connect(this._options.dbURL, {
                useUnifiedTopology: true,
                useNewUrlParser: true,
            }, (err: any, client: MongoClient) => {
                if (err !== null) {
                    return reject(err);
                }

                this._client = client;
                this._db = client.db(this._options.dbName);
                
                this._collection = this._db.collection(this.name.toLowerCase());
                this._collection.createIndexes(
                    [
                        { 
                            key: {
                                uid: 1
                            } 
                        },
                        { 
                            key: {
                                createdTimestamp: 1
                            } 
                        }
                    ],
                    function(err2: any, results: any) {
                        resolve();
                    }
                );
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
            this._collection.findOne(query).then(serializedObject => {
                if (serializedObject === null) {
                    return reject(`${this.dataType.name} not found!`);
                }
                resolve(DataSerializer.deserialize(serializedObject, this.dataType as any));
            }).catch(ex => {
                reject(ex);
            });
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
                const deserializedResults = new Array();
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
            this._collection.findOne({ _id: id }).then(existingObject => {
                const preparedObject = DataSerializer.serialize(object);
                preparedObject._id = id;
                if (existingObject === null) {
                    this._collection.insertOne(preparedObject, function(err: any, result: any) {
                        if (err !== null) {
                            return reject(err);
                        }
                        resolve(object);
                    });
                } else {
                    this._collection.updateOne({ _id: id }, {  $set: preparedObject }, function(err: any, result: any) {
                        if (err !== null) {
                            return reject(err);
                        }
                        resolve(object);
                    });
                }
            }).catch(ex => {
                reject(ex);
            });
        });
    }

    public delete(id: I): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection.deleteOne({ _id: id }).then(() => {
                resolve();
            }).catch(ex => {
                reject(ex);
            });
        });
    }

    public deleteAll(query?: FilterQuery<T>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this._collection === undefined) {
                return reject(new Error(`MongoDB connection not ready!`));
            }
            this._collection.deleteMany(query).then(() => {
                resolve();
            }).catch(ex => {
                reject(ex);
            });
        });
    }

}
