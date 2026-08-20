import assert from 'node:assert/strict';
export function defineReadOnly(object,key,value){Object.defineProperty(object,key,{value,enumerable:true,writable:false,configurable:false});return object;}
export function createTemperature(celsius=0){let value=celsius;return {get celsius(){return value;},set celsius(next){if(!Number.isFinite(next))throw new TypeError('finite');value=next;}};}
export function shallowUpdate(object,patch){return {...object,...patch};}
const o=defineReadOnly({},'id',1);assert.equal(o.id,1);assert.throws(()=>{o.id=2},TypeError);const t=createTemperature();t.celsius=20;assert.equal(t.celsius,20);assert.throws(()=>{t.celsius=NaN});const a={nested:{x:1}};const b=shallowUpdate(a,{name:'A'});assert.notStrictEqual(a,b);assert.strictEqual(a.nested,b.nested);
