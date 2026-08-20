import assert from 'node:assert/strict';
export function makeRange(from,to){return {from,to,*[Symbol.iterator](){for(let n=from;n<=to;n++)yield n;}};}
export function validatedAge(target={}){return new Proxy(target,{set(obj,key,value){if(key==='age'&&(!Number.isInteger(value)||value<0))throw new RangeError('age');return Reflect.set(obj,key,value);}});}
export function cloneData(value){if(typeof globalThis.structuredClone!=='function')throw new Error('structuredClone unavailable');return structuredClone(value);}
assert.deepEqual([...makeRange(2,4)],[2,3,4]);const p=validatedAge();p.age=4;assert.equal(p.age,4);assert.throws(()=>{p.age=-1},RangeError);const original={date:new Date('2026-01-01')};const clone=cloneData(original);assert.notStrictEqual(clone,original);assert.equal(clone.date instanceof Date,true);
