import test from 'node:test';import assert from 'node:assert/strict';
import {appOrigin,backendConfig} from '../lib/config.mjs';
test('production origin uses trusted Vercel environment',()=>assert.equal(appOrigin({VERCEL_PROJECT_PRODUCTION_URL:'cc.example.com'}),'https://cc.example.com'));
test('missing system config fails closed',()=>assert.equal(appOrigin({}),undefined));
test('invalid origins are not accepted',()=>{for(const host of ['evil.com/path','evil.com:443','evil.com@other.com','https://evil.com','evil.com\n'])assert.equal(appOrigin({VERCEL_PROJECT_PRODUCTION_URL:host}),undefined);assert.throws(()=>appOrigin({APP_ORIGIN:'http://cc.example.com'}));assert.throws(()=>appOrigin({APP_ORIGIN:'https://cc.example.com/path'}));});
test('explicit production origin takes precedence',()=>assert.equal(appOrigin({APP_ORIGIN:'https://app.example.com',VERCEL_PROJECT_PRODUCTION_URL:'preview.vercel.app'}),'https://app.example.com'));
test('only publishable credentials used by default',()=>{const c=backendConfig({});assert.match(c.key,/^sb_publishable_/);assert.match(c.url,/^https:\/\/[a-z]+\.supabase\.co$/);assert.equal(backendConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}).key,'test');});

import {appOrigins} from '../lib/config.mjs';
import {sameOrigin} from '../lib/validation.mjs';
const deploymentEnv={VERCEL_PROJECT_PRODUCTION_URL:'cc.vercel.app',VERCEL_URL:'cc-ab123-team.vercel.app',VERCEL_BRANCH_URL:'cc-git-main-team.vercel.app'};
test('login accepts production, exact deployment and branch alias',()=>{for(const origin of ['https://cc.vercel.app','https://cc-ab123-team.vercel.app','https://cc-git-main-team.vercel.app'])sameOrigin({headers:{origin}},appOrigins(deploymentEnv));});
test('other Vercel projects and lookalike domains stay blocked',()=>{for(const origin of ['https://attacker.vercel.app','https://cc.vercel.app.attacker.com','null','http://cc.vercel.app'])assert.throws(()=>sameOrigin({headers:{origin}},appOrigins(deploymentEnv)),e=>e.status===403);});
test('missing origin remains blocked even with forged host headers',()=>assert.throws(()=>sameOrigin({headers:{host:'cc.vercel.app','x-forwarded-host':'cc.vercel.app'}},appOrigins(deploymentEnv))));
test('deployment URL works when production URL is unavailable',()=>sameOrigin({headers:{origin:'https://cc-ab123-team.vercel.app'}},appOrigins({VERCEL_URL:deploymentEnv.VERCEL_URL})));
test('explicit override restricts all deployment aliases',()=>assert.deepEqual(appOrigins({...deploymentEnv,APP_ORIGIN:'https://app.example.com'}),['https://app.example.com']));
