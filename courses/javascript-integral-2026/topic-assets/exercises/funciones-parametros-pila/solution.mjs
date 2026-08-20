import assert from 'node:assert/strict';
export function summarize({name,tags=[]}={},...scores){if(typeof name!=='string')throw new TypeError('name');return {name,tags:[...tags],total:scores.reduce((a,b)=>a+b,0)};}
export function mapWith(values,callback){if(!Array.isArray(values))throw new TypeError('values');return values.map((v,i)=>callback(v,i));}
export function factorialIterative(n){if(!Number.isInteger(n)||n<0)throw new RangeError('n');let r=1;for(let i=2;i<=n;i++)r*=i;return r;}
assert.deepEqual(summarize({name:'Ada',tags:['js']},2,3),{name:'Ada',tags:['js'],total:5});assert.deepEqual(mapWith([2,3],(x,i)=>x+i),[2,4]);assert.equal(factorialIterative(5),120);assert.throws(()=>factorialIterative(-1));
