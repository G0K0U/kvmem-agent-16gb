import {describe,it,expect} from 'vitest'
import {applyQwenRewrite} from '../src/qwen-advanced.js'
import type {RewriteResult} from '../src/local-gpu.js'
const base={'4':{class_type:'TextEncodeQwenImage21',inputs:{prompt:'raw'}},'5':{class_type:'EmptyLatentImage',inputs:{}},'6':{class_type:'KSampler',inputs:{}},'9':{class_type:'LoadImage',inputs:{image:'placeholder'}}}
const rewrite:RewriteResult={prompt:'clean',width:1024,height:1024,wh_ratio:'',ratio_follow:'<image1>',followIndex:0,model:'qwen',template:'edit',sourceCount:2,logPath:'test'}
describe('Qwen advanced graph',()=>{
 it('preserves ordered references and uses the encoder latent for image1',()=>{
  const r:any=applyQwenRewrite(base,rewrite,['first.png','second.png'])
  expect(r['100'].inputs.image).toBe('first.png');expect(r['101'].inputs.image).toBe('second.png')
  expect(r['4'].inputs['images.image_2']).toEqual(['101',0]);expect(r['6'].inputs.latent_image).toEqual(['4',2])
  expect(r['9']).toBeUndefined();expect(base['9']).toBeDefined()
 })
 it('uses explicit dimensions rather than image1 for a requested new aspect ratio',()=>{
  const r:any=applyQwenRewrite(base,{...rewrite,wh_ratio:'16:9',ratio_follow:'',width:1376,height:768},['first.png'])
  expect(r['6'].inputs.latent_image).toEqual(['5',0]);expect(r['5'].inputs.width).toBe(1376)
 })
})
