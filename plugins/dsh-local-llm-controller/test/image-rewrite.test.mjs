import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseRewrite} from '../lib/image-rewrite.js'
test('official JSON separates prompt and aspect ratio',()=>{
 const r=parseRewrite('{"rewritten_prompt":"A cat", "wh_ratio":"16:9"}')
 assert.equal(r.prompt,'A cat');assert.equal(r.width%32,0);assert.equal(r.height%32,0)
 assert.ok(Math.abs(r.width/r.height-16/9)<0.06)
})
test('ordered second-image aspect ratio is preserved',()=>{
 const r=parseRewrite('{"rewritten_prompt":"edit", "wh_ratio":"", "ratio_follow":"<image2>"}',[{width:1024,height:1024},{width:640,height:960}])
 assert.equal(r.followIndex,1);assert.ok(r.height>r.width)
})
test('reject invalid or conflicting rewrite without submitting an image',()=>{
 for(const text of ['bad','{}','{"rewritten_prompt":"x","wh_ratio":"1:0"}','{"rewritten_prompt":"x","ratio_follow":"<image2>"}','{"rewritten_prompt":"x","wh_ratio":"1:1","ratio_follow":"<image1>"}'])assert.throws(()=>parseRewrite(text))
})
