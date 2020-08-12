import { Model, DataFrame, ModelBuilder, LoggingSinkNode, DataObject, DataFrameService, DataObjectService } from "@openhps/core";
import { expect } from 'chai';
import { MongoDataServiceDriver } from "../../src/service";

describe('data frame service', () => {
    describe('output layer', () => {
        var model: Model<DataFrame, DataFrame>;
        var frameDataService: DataFrameService<DataFrame>;
        
        before(function(done) {
            this.timeout(5000);
            ModelBuilder.create()
                .addService(new DataObjectService(new MongoDataServiceDriver(DataObject, {
                    dbURL: "mongodb://mongo:27017",
                    dbName: "test"
                })))
                .addService(new DataFrameService(new MongoDataServiceDriver(DataFrame, {
                    dbURL: "mongodb://mongo:27017",
                    dbName: "test"
                })))
                .from()
                .to(new LoggingSinkNode())
                .build().then((m: Model) => {
                    model = m;
                    frameDataService = model.findDataService("DataFrame");
                    done();
                });
        });

        after((done) => {
            model.emitAsync("destroy").then(() => {
                done();
            });
        });
    
        it('should delete frame at the output layer', (done) => {
            var object = new DataObject();
            object.displayName = "Test";
            var frame = new DataFrame();
            frame.addObject(object);
            model.push(frame).then(_ => {
                frameDataService.findAll().then(frames => {
                    expect(frames.length).to.equal(0);
                    done();
                }).catch(ex => {
                    done(ex);
                });
            }).catch(ex => {
                done(ex);
            });
        });
    
    });
});