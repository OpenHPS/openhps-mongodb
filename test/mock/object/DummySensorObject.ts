import { DataObject, SerializableObject, SensorObject, AngleUnit } from '@openhps/core';

@SerializableObject()
export class DummySensorObject extends DataObject implements SensorObject {
    public horizontalFOV: number;
    public verticalFOV: number;
    public fovUnit: AngleUnit;
}
