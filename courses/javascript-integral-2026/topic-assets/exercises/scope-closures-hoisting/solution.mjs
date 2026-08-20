import assert from 'node:assert/strict';
export function makeCounter(start=0){let n=start;return {next:()=>++n,current:()=>n,reset:()=>{n=start;}};}
export function makeHandlers(values){return values.map(value=>()=>value);}
export function retainUntilRelease(value){let held=value;return {get:()=>held,release:()=>{held=null;}};}
const c=makeCounter(2);assert.equal(c.next(),3);c.reset();assert.equal(c.current(),2);assert.deepEqual(makeHandlers(['a','b']).map(f=>f()),['a','b']);const r=retainUntilRelease({x:1});assert.equal(r.get().x,1);r.release();assert.equal(r.get(),null);
