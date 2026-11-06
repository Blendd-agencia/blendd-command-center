import test from 'node:test';import assert from 'node:assert/strict';
import {appOrigin,backendConfig} from '../lib/config.mjs';
test('production origin uses trusted Vercel environment',()=>assert.equal(appOrigin({VERCEL_PROJECT_PRODUCTION_URL:'cc.example.com'}),'https://cc.example.com'));
test('missing system config fails closed',()=>assert.equal(appOrigin({}),undefined));
test('invalid origins are not accepted',()=>{for(const host of ['evil.com/path','evil.com:443','evil.com@other.com','https://evil.com','evil.com\n'])assert.equal(appOrigin({VERCEL_PROJECT_PRODUCTION_URL:host}),undefined);assert.throws(()=>appOrigin({APP_ORIGIN:'http://cc.example.com'}));assert.throws(()=>appOrigin({APP_ORIGIN:'https://cc.example.com/path'}));});
test('explicit production origin takes precedence',()=>assert.equal(appOrigin({APP_ORIGIN:'https://app.example.com',VERCEL_PROJECT_PRODUCTION_URL:'preview.vercel.app'}),'https://app.example.com'));
test('only publishable credentials used by default',()=>{const c=backendConfig({});assert.match(c.key,/^sb_publishable_/);assert.match(c.url,/^https:\/\/[a-z]+\.supabase\.co$/);assert.equal(backendConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}).key,'test');});
