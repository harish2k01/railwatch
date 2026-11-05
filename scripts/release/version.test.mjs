import {test} from 'node:test';import assert from 'node:assert/strict';import {bumpLabel,nextVersion,planVersions,newestTarget} from './version.mjs';
test('exactly one semantic label is required',()=>{assert.equal(bumpLabel([{name:'major'}]),'major');for(const labels of [[],['major','patch'],['enhancement']])assert.throws(()=>bumpLabel(labels));});
test('version bumps match portfolio',()=>{assert.equal(nextVersion('v0.15.0','major'),'v1.0.0');assert.equal(nextVersion('v1.2.3','minor'),'v1.3.0');assert.equal(nextVersion('v1.2.3','patch'),'v1.2.4');assert.throws(()=>nextVersion('latest','patch'));});
test('reconciles all merges in order and ignores unmerged commits',()=>{const merged=(sha,number,bump)=>({sha,prs:[{merged_at:'2026-10-02',base:{ref:'main'},merge_commit_sha:sha,number,labels:[{name:bump}]}]});assert.deepEqual(planVersions('v0.15.0',[{sha:'direct',prs:[]},merged('a',1,'major'),merged('b',2,'patch')]).map(p=>p.tag),['v1.0.0','v1.0.1']);assert.throws(()=>planVersions('v0.15.0',[merged('bad',3,'enhancement')]));});

test("newestTarget keeps only the highest version", () => {
  assert.deepEqual(newestTarget([]), []);
  assert.deepEqual(newestTarget([{ tag: "v2.25.0", sha: "a" }, { tag: "v2.26.0", sha: "b" }, { tag: "v2.9.9", sha: "c" }]), [{ tag: "v2.26.0", sha: "b" }]);
});
