import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPlatform } from '../optics/server.mjs';

test('classroom enrollment, assessment drafting, locked submission and published grades', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'optics-classroom-'));
  const config = { database: join(directory, 'responses.sqlite'), origin: 'http://localhost:3000', teachers: ['teacher@school.test'] };
  let app = createPlatform(config);
  t.after(async () => {
    if (app.server.listening) await app.close();
    for (const suffix of ['', '-wal', '-shm']) await rm(config.database + suffix, { force: true });
    await rmdir(directory);
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const teacher = app.sessionFor({ sub: 'teacher', email: 'teacher@school.test', name: '老師', hd: 'school.test' });
  const student = app.sessionFor({ sub: 'student', email: 'student@school.test', name: '學生', hd: 'school.test' });
  const outsider = app.sessionFor({ sub: 'other', email: 'other@example.test', name: '另一位學生' });
  const request = async (cookie, path, body) => {
    const address = 'http://127.0.0.1:' + app.server.address().port;
    const response = await fetch(address + '/optics/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return [response.status, await response.json()];
  };
  assert.equal((await request(student, 'classes', { name: '物理' }))[0], 403);
  const [created, classroom] = await request(teacher, 'classes', { name: '物理', domain: 'school.test' });
  assert.equal(created, 201);
  const [assigned, exam] = await request(teacher, 'exams', { classroom: classroom.id, title: '光學', lab: 'refraction', prompt: '測水的折射率' });
  assert.equal(assigned, 201);
  assert.equal((await request(student, 'exams/' + exam.id))[0], 403);
  assert.equal((await request(outsider, 'join', { code: classroom.code }))[0], 403);
  assert.equal((await request(teacher, 'exceptions', { classroom: classroom.id, email: 'other@example.test' }))[0], 200);
  assert.equal((await request(student, 'join', { code: classroom.code }))[0], 200);
  assert.equal((await request(outsider, 'join', { code: classroom.code }))[0], 200);
  const snapshot = { setup: {}, graph: {}, rows: [], events: [], analysis: '結果' };
  assert.equal((await request(student, 'exams/' + exam.id + '/draft', { snapshot }))[0], 200);
  const [, submitted] = await request(student, 'exams/' + exam.id + '/submit', { snapshot });
  const [, retried] = await request(student, 'exams/' + exam.id + '/submit', { snapshot: { ...snapshot, analysis: '重送' } });
  assert.equal(submitted.id, retried.id);
  assert.equal(retried.snapshot.analysis, '結果');
  assert.equal((await request(student, 'exams/' + exam.id + '/draft', { snapshot }))[0], 409);
  assert.equal((await request(outsider, 'submissions/' + submitted.id))[0], 403);
  const grading = { scores: [25, 23, 22, 20], comment: '請補選軸理由', publish: false };
  assert.equal((await request(student, 'submissions/' + submitted.id + '/grade', grading))[0], 403);
  assert.equal((await request(teacher, 'submissions/' + submitted.id + '/grade', grading))[0], 200);
  assert.equal((await request(student, 'exams/' + exam.id))[1].attempt.grade, null);
  assert.equal((await request(teacher, 'submissions/' + submitted.id + '/grade', { ...grading, publish: true }))[0], 200);
  assert.equal((await request(student, 'exams/' + exam.id))[1].attempt.grade.comment, grading.comment);
  await app.close();
  app = createPlatform(config);
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const [restored, data] = await request(student, 'exams/' + exam.id);
  assert.equal(restored, 200);
  assert.equal(data.attempt.id, submitted.id);
  assert.deepEqual(data.attempt.snapshot, snapshot);
  assert.deepEqual(data.attempt.grade, { scores: grading.scores, comment: grading.comment });
});
