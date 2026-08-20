import assert from 'node:assert/strict';
export function invokeWith(receiver,fn,args=[]){return Reflect.apply(fn,receiver,args);}
export function makeUser(name){if(!new.target)throw new TypeError('use new');this.name=name;}
export function makeArrowReader(){const value=7;return {value:2,method(){return this.value;},arrow:()=>value};}
assert.equal(invokeWith({n:3},function(x){return this.n+x;},[4]),7);assert.equal(new makeUser('Ada').name,'Ada');assert.throws(()=>makeUser('Ada'));const x=makeArrowReader();assert.equal(x.method(),2);assert.equal(x.arrow.call({value:9}),7);
