import assert from 'node:assert/strict';
const canSpeak={speak(){return this.name+' habla';}};export function makeSpeaker(name){return Object.assign(Object.create(canSpeak),{name});}
export class Account{#balance=0;deposit(n){if(!Number.isInteger(n)||n<=0)throw new RangeError('n');this.#balance+=n;}get balance(){return this.#balance;}}
export function composeNotifier(format,send){return message=>send(format(message));}
assert.equal(makeSpeaker('Ada').speak(),'Ada habla');const a=new Account();a.deposit(3);assert.equal(a.balance,3);assert.throws(()=>a.deposit(0));let out='';composeNotifier(x=>'['+x+']',x=>{out=x;})('ok');assert.equal(out,'[ok]');
