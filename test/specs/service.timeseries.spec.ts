import { MONGO_URL } from '../mongoUrl';
import { DataObject, DataObjectService } from '@openhps/core';
import { expect } from 'chai';
import 'mocha';
import { MongoClient } from 'mongodb';
import { MongoDataServiceDriver } from '../../src';

describe('Time-series DataObjectService', () => {
    const collectionName = 'dataobject_timeseries';
    const expireAfterSeconds = 7 * 24 * 60 * 60;
    let objectDataService: DataObjectService<DataObject>;
    let client: MongoClient;

    before(async () => {
        client = await MongoClient.connect(MONGO_URL);
        // A previous run may have created the collection as a regular collection.
        await client
            .db('test')
            .collection(collectionName)
            .drop()
            .catch(() => undefined);

        objectDataService = new DataObjectService(
            new MongoDataServiceDriver(DataObject, {
                dbURL: MONGO_URL,
                dbName: 'test',
                collectionName,
                timeSeries: {
                    timeField: 'time',
                    metaField: 'meta',
                    metaFields: ['uid', 'displayName'],
                    granularity: 'seconds',
                    expireAfterSeconds,
                    indexes: [{ 'meta.uid': 1, time: -1 }],
                },
            }),
        );
        await objectDataService.emitAsync('build');
        await objectDataService.deleteAll({});
    });

    after(async () => {
        await objectDataService.emitAsync('destroy');
        await client
            .db('test')
            .collection(collectionName)
            .drop()
            .catch(() => undefined);
        await client.close();
    });

    it('should create the collection as a time-series collection', async () => {
        const collections = await client.db('test').listCollections({ name: collectionName }).toArray();
        expect(collections.length).to.equal(1);
        const options: any = (collections[0] as any).options;
        expect(options.timeseries).to.deep.include({
            timeField: 'time',
            metaField: 'meta',
            granularity: 'seconds',
        });
        expect(options.expireAfterSeconds).to.equal(expireAfterSeconds);
    });

    it('should create the configured compound index', async () => {
        const indexes = await client.db('test').collection(collectionName).indexes();
        const keys = indexes.map((index) => index.key as any);
        expect(keys.some((key) => key['meta.uid'] === 1 && key.time === -1)).to.equal(true);
    });

    it('should store the time and metadata members', async () => {
        const object = new DataObject('timeseries1');
        object.displayName = 'Time series';
        object.createdTimestamp = Date.parse('10 Mar 1995 00:00:00 GMT');
        await objectDataService.insert(object.uid, object);

        const document = await client.db('test').collection(collectionName).findOne({ _id: 'timeseries1' });
        expect(document.time).to.be.instanceOf(Date);
        expect(document.time.getTime()).to.equal(Date.parse('10 Mar 1995 00:00:00 GMT'));
        expect(document.meta).to.deep.equal({
            uid: 'timeseries1',
            displayName: 'Time series',
        });
    });

    it('should append on a repeated insert', async () => {
        const object = new DataObject('timeseries2');
        object.createdTimestamp = Date.parse('10 Mar 1995 01:00:00 GMT');
        await objectDataService.insert(object.uid, object);
        object.createdTimestamp = Date.parse('10 Mar 1995 02:00:00 GMT');
        await objectDataService.insert(object.uid, object);

        const count = await client.db('test').collection(collectionName).countDocuments({
            _id: 'timeseries2',
        });
        expect(count).to.equal(2);
    });

    it('should find objects by their metadata', async () => {
        const objects = await objectDataService.findAll({ 'meta.uid': 'timeseries2' });
        expect(objects.length).to.equal(2);
        expect(objects[0].uid).to.equal('timeseries2');
    });

    it('should find objects in a time range', async () => {
        const objects = await objectDataService.findAll({
            time: {
                $gte: new Date(Date.parse('10 Mar 1995 01:30:00 GMT')),
                $lte: new Date(Date.parse('10 Mar 1995 03:00:00 GMT')),
            },
        });
        expect(objects.length).to.equal(1);
    });

    it('should delete a data object', async () => {
        await objectDataService.delete('timeseries2');
        const count = await client.db('test').collection(collectionName).countDocuments({
            _id: 'timeseries2',
        });
        expect(count).to.equal(0);
    });
});

describe('Time-series DataObjectService with default options', () => {
    const collectionName = 'dataobject_timeseries_default';
    let objectDataService: DataObjectService<DataObject>;
    let client: MongoClient;

    before(async () => {
        client = await MongoClient.connect(MONGO_URL);
        await client
            .db('test')
            .collection(collectionName)
            .drop()
            .catch(() => undefined);
        objectDataService = new DataObjectService(
            new MongoDataServiceDriver(DataObject, {
                dbURL: MONGO_URL,
                dbName: 'test',
                collectionName,
                timeSeries: {},
            }),
        );
        await objectDataService.emitAsync('build');
    });

    after(async () => {
        await objectDataService.emitAsync('destroy');
        await client
            .db('test')
            .collection(collectionName)
            .drop()
            .catch(() => undefined);
        await client.close();
    });

    it('should use the documented defaults', async () => {
        const object = new DataObject('defaults');
        await objectDataService.insert(object.uid, object);

        const document = await client.db('test').collection(collectionName).findOne({ _id: 'defaults' });
        expect(document.time).to.be.instanceOf(Date);
        expect(document.meta.uid).to.equal('defaults');

        const collectionInfo: any = (await client.db('test').listCollections({ name: collectionName }).toArray())[0];
        expect(collectionInfo.options.timeseries).to.deep.include({
            timeField: 'time',
            metaField: 'meta',
        });
        expect(collectionInfo.options.expireAfterSeconds).to.equal(undefined);

        const keys = (await client.db('test').collection(collectionName).indexes()).map((index) => index.key as any);
        expect(keys.some((key) => key['meta.uid'] === 1 && key.time === -1)).to.equal(true);
    });
});
