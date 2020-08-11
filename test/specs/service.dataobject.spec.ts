import { Model, ModelBuilder, DataFrame, LoggingSinkNode, DataObject, DataObjectService, Absolute2DPosition, Absolute3DPosition, CallbackSourceNode } from '@openhps/core';
import { DummyDataObject } from '../mock/object/DummyDataObject';
import { DummySensorObject } from '../mock/object/DummySensorObject';

import { expect } from 'chai';
import 'mocha';
import { MongoDataService } from '../../src/service';

describe('data object', () => {
    describe('service', () => {
        var objectDataService: DataObjectService<DataObject>;

        before((done) => {
            objectDataService = new DataObjectService(new MongoDataService(DataObject, {
                dbURL: "mongodb://mongo:27017",
                dbName: "test"
            }));

            objectDataService.emitAsync("build").then(() => {
                objectDataService.deleteAll().then(_ => {
                    var object1 = new DataObject();
                    object1.setCurrentPosition(new Absolute2DPosition(5, 6));
                    object1.displayName = "Test";
        
                    var object2 = new DataObject();
                    object2.setCurrentPosition(new Absolute3DPosition(5, 6, 2));
                    object2.displayName = "Test";
        
                    const insertPromises = new Array();
                    insertPromises.push(objectDataService.insert(object1.uid, object1));
                    insertPromises.push(objectDataService.insert(object2.uid, object2));
                    
                    Promise.all(insertPromises).then(() => {
                        done();
                    }).catch(ex => {
                        done(ex);
                    });
                });
            });
        });

        after((done) => {
            objectDataService.emitAsync("destroy").then(() => {
                done();
            });
        });     

        it('should find a object by 2d location', (done) => {
            objectDataService.findByPosition(new Absolute2DPosition(5, 6)).then(objects => {
                expect(objects[0].getCurrentPosition()).to.be.instanceOf(Absolute2DPosition);
                const location = objects[0].getCurrentPosition() as Absolute2DPosition;
                expect(location.x).to.equal(5);
                expect(location.y).to.equal(6);
                expect(objects[0].displayName).to.equal("Test");
                done();
            }).catch(ex => {
                done(ex);
            });
        });

        it('should find a object by 3d location', (done) => {
            objectDataService.findByPosition(new Absolute3DPosition(5, 6, 2)).then(objects => {
                expect(objects[0].getCurrentPosition()).to.be.instanceOf(Absolute3DPosition);
                const location = objects[0].getCurrentPosition() as Absolute3DPosition;
                expect(location.x).to.equal(5);
                expect(location.y).to.equal(6);
                expect(location.z).to.equal(2);
                expect(objects[0].displayName).to.equal("Test");
                done();
            }).catch(ex => {
                done(ex);
            });
        });
        
        it('should store objects', (done) => {
            var object = new DataObject("2");
            object.displayName = "Test";
            objectDataService.insert(object.uid, object).then(savedObject => {
                expect(savedObject.uid).to.equal("2");
                expect(savedObject.displayName).to.equal("Test");
                objectDataService.findByUID("2").then(savedObject => {
                    expect(savedObject.uid).to.equal("2");
                    expect(savedObject.displayName).to.equal("Test");
                    done();
                });
            });
        });

        it('should update objects', (done) => {
            var object = new DataObject("3");
            object.displayName = "Update 1";
            objectDataService.insert(object.uid, object).then(savedObject => {
                expect(savedObject.uid).to.equal("3");
                expect(savedObject.displayName).to.equal("Update 1");
                objectDataService.findByUID("3").then(savedObject => {
                    expect(savedObject.uid).to.equal("3");
                    expect(savedObject.displayName).to.equal("Update 1");
                   
                    object.displayName = "Update 2";
                    objectDataService.insert(object.uid, object).then(savedObject => {
                        expect(savedObject.uid).to.equal("3");
                        expect(savedObject.displayName).to.equal("Update 2");
                        objectDataService.findByUID("3").then(savedObject => {
                            expect(savedObject.uid).to.equal("3");
                            expect(savedObject.displayName).to.equal("Update 2");
                            done();
                        });
                    });
                });
            });
        });

        it('should throw an error when quering non existing objects', (done) => {
            objectDataService.findByUID("test").then(savedObject => {
                done(`No error triggered!`);
            }).catch(ex => {
                done();
            });
        });

        it('should find all items', () => {
            objectDataService.findAll().then(objects => {
                expect(objects.length).to.be.gte(1);
            });
        });

    });
    describe('input layer', () => {
        var model: Model<DataFrame, DataFrame>;
        var objectDataService: DataObjectService<DataObject>;
        
        before((done) => {
            objectDataService = new DataObjectService(new MongoDataService(DataObject, {
                dbURL: "mongodb://mongo:27017",
                dbName: "test"
            }));
            ModelBuilder.create()
                .addService(objectDataService)
                .from(new CallbackSourceNode())
                .to(new LoggingSinkNode())
                .build().then((m: Model) => {
                    model = m;

                    var object = new DummySensorObject("123");
                    object.displayName = "Hello";

                    objectDataService.deleteAll().then(() => {
                        objectDataService.insert(object.uid, object).then(savedObject => {
                            done();
                        });
                    });
                });
        });

        after((done) => {
            model.emitAsync("destroy").then(() => {
                done();
            });
        });

        it('should load unknown objects', (done) => {
            var object = new DummySensorObject("123");
            var frame = new DataFrame();
            frame.addObject(object);
            model.push(frame).then(_ => {
                // Check if it is stored
                objectDataService.findAll().then(objects => {
                    expect(objects[0].displayName).to.equal("Hello");
                    done();
                }).catch(ex => {
                    done(ex);
                });
            }).catch(ex => {
                done(ex);
            });
        });

    });

    describe('output layer', () => {
        var model: Model<DataFrame, DataFrame>;
        var objectDataService: DataObjectService<DataObject>;
        
        before((done) => {
            objectDataService = new DataObjectService(new MongoDataService(DataObject, {
                dbURL: "mongodb://mongo:27017",
                dbName: "test"
            }));

            ModelBuilder.create()
                .addService(objectDataService)
                .from()
                .to(new LoggingSinkNode())
                .build().then((m: Model) => {
                    model = m;
                    done();
                });
        });

        after((done) => {
            model.emitAsync("destroy").then(() => {
                done();
            });
        });

        it('should store objects at the output layer', (done) => {
            var object = new DataObject("4321");
            object.displayName = "Test";
            var frame = new DataFrame();
            frame.addObject(object);
            model.push(frame).then(() => {
                // Check if it is stored
                objectDataService.findByUID("4321").then(object => {
                    expect(object.displayName).to.equal("Test");
                    done();
                }).catch(ex => {
                    done(ex);
                });
            }).catch(ex => {
                done(ex);
            });
        });

        it('should update objects', (done) => {
            var object = new DummyDataObject("4");
            object.displayName = "Sensor Test";
            object.count = 1;

            var frame = new DataFrame();
            frame.source = object;
            model.push(frame).then(_ => {

                objectDataService.findByUID("4").then((savedObject: DummyDataObject) => {
                    expect(savedObject.uid).to.equal("4");
                    expect(savedObject.displayName).to.equal("Sensor Test");
                    expect(savedObject.count).to.equal(1);
                   
                    object.count = 2;
                    var frame = new DataFrame();
                    frame.source = object;
                    model.push(frame).then(_ => {

                        objectDataService.findByUID("4").then((savedObject: DummyDataObject) => {
                            expect(savedObject.uid).to.equal("4");
                            expect(savedObject.displayName).to.equal("Sensor Test");
                            expect(savedObject.count).to.equal(2);
                            done();
                        });

                    });

                });
            });
        });

        it('should store unknown data objects at the output layer', (done) => {
            var object = new DummySensorObject();
            object.displayName = "Testabc";
            var frame = new DataFrame();
            frame.addObject(object);
            model.push(frame).then(() => {
                // Check if it is stored
                objectDataService.findAll().then(objects => {
                    expect(objects[objects.length - 1].displayName).to.equal("Testabc");
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